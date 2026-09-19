import {
  DEFAULT_CURRENCY,
  DEFAULT_PROFILE_DISPLAY_NAME,
  DEFAULT_PROFILE_ID,
  PURCHASE_ITEM_CATEGORIES,
  REDEMPTION_STATUSES,
} from './constants';
import type { Migration } from './types';

/**
 * 版本化迁移。
 *
 * 规则：
 * - 已发布的迁移**只读**。改 schema 一律追加新的 `version`，不修改历史迁移。
 * - 不通过删库或删表重建来升级。
 * - 每条迁移由 `initialize-database.ts` 包在一个事务里执行，并在同一事务内推进
 *   `PRAGMA user_version`，任一步失败都会整体回滚。
 * - 本文件里的 SQL 全部是固定字面量；唯一被插值的是本模块内的常量数组
 *   （分类 code、核销状态、默认币种），不接受任何运行时或用户输入。
 *   带用户输入的语句一律走 `runAsync` 参数绑定。
 */

/** `'light_energy', 'injection', ...`，用于 CHECK 约束。取值见 constants.ts。 */
const CATEGORY_VALUES_SQL = PURCHASE_ITEM_CATEGORIES.map((code) => `'${code}'`).join(', ');

/** `'active', 'void'`，用于 CHECK 约束。 */
const STATUS_VALUES_SQL = REDEMPTION_STATUSES.map((status) => `'${status}'`).join(', ');

/**
 * V1 建表语句。
 *
 * 设计口径（ADR-006 / ADR-013 / ADR-014 / ADR-015、PRD 第 5A、6、7 章）：
 * - 业务 ID 一律为 App 侧生成的 UUID 字符串，不使用自增整数。
 * - 金额存整数分；业务日期存 `YYYY-MM-DD`；系统时间戳存 UTC ISO 8601。
 * - 布尔值存 0/1 并加 CHECK。
 * - 不建照片字段、不建 B 端表、不建 AI 对话表、不建云同步队列。
 */
const V1_TABLES: readonly string[] = [
  // 档案：第一版只有本人一个 Profile，不提供切换与多人管理（ADR-015）。
  `CREATE TABLE profiles (
     id           TEXT    NOT NULL PRIMARY KEY,
     display_name TEXT    NOT NULL CHECK (length(trim(display_name)) > 0),
     is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
     created_at   TEXT    NOT NULL,
     updated_at   TEXT    NOT NULL
   )`,

  // 机构：用户自由新增、自动复用的独立实体，不依赖外部名录（ADR-014）。
  // 同名机构允许并存，因此 normalized_name 只建普通索引，不加唯一约束。
  // 机构不随套餐删除而删除，生命周期由归档（is_archived）管理（ADR-016）。
  `CREATE TABLE institutions (
     id              TEXT    NOT NULL PRIMARY KEY,
     profile_id      TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     normalized_name TEXT    NOT NULL,
     city            TEXT,
     notes           TEXT,
     is_archived     INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
     created_at      TEXT    NOT NULL,
     updated_at      TEXT    NOT NULL
   )`,

  // 购买记录。
  // institution_id 用 ON DELETE RESTRICT：被业务记录引用的机构走归档，不物理删除。
  // 第一版没有软删除、没有回收站：用户二次确认后执行真正的 DELETE，
  // 项目与核销记录经外键级联清除，机构与档案不受影响（ADR-016）。
  `CREATE TABLE purchases (
     id                        TEXT    NOT NULL PRIMARY KEY,
     profile_id                TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     institution_id            TEXT    REFERENCES institutions (id) ON DELETE RESTRICT,
     institution_name_snapshot TEXT,
     city_snapshot             TEXT,
     name                      TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     purchase_date             TEXT    NOT NULL
                                       CHECK (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
     total_amount_minor        INTEGER NOT NULL CHECK (total_amount_minor >= 0),
     currency                  TEXT    NOT NULL DEFAULT '${DEFAULT_CURRENCY}'
                                       CHECK (length(currency) = 3),
     expires_on                TEXT    CHECK (
                                         expires_on IS NULL
                                         OR expires_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                                       ),
     notes                     TEXT,
     created_at                TEXT    NOT NULL,
     updated_at                TEXT    NOT NULL,
     -- 有效期不得早于购买日期（PRD-PUR-006）；为空表示未知或长期有效（PRD-PUR-007）。
     CHECK (expires_on IS NULL OR expires_on >= purchase_date)
   )`,

  // 套餐项目。
  // unit_amount_minor 是必填的分摊单价（整数分），0 表示赠送项目；
  // 项目分摊总额 = unit_amount_minor × quantity，由上层派生，不落库。
  // 套餐总价允许与各项目分摊之和不同（折扣、赠送、整体定价），
  // 差额提示是 service/UI 的业务规则，不在这里用 CHECK 阻断保存（PRD-PUR-005）。
  // 不保存 remaining：剩余次数由 quantity 减去 active 核销数派生（ARCHITECTURE 第四节）。
  // ON DELETE CASCADE：套餐被删除时项目一并清除，不会留下孤儿（ADR-016）。
  `CREATE TABLE purchase_items (
     id                TEXT    NOT NULL PRIMARY KEY,
     purchase_id       TEXT    NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
     name              TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     category          TEXT    NOT NULL CHECK (category IN (${CATEGORY_VALUES_SQL})),
     quantity          INTEGER NOT NULL CHECK (quantity > 0),
     unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
     notes             TEXT,
     created_at        TEXT    NOT NULL,
     updated_at        TEXT    NOT NULL
   )`,

  // 核销记录。
  // 单条核销的纠错路径是「撤销核销」而不是删除：作废保留原记录，
  // status 只能是 active 或 void，且 void 必须有 voided_at、active 必须没有
  // （PRD 第 7.2 节、ADR-016）。整个套餐被删除时才随项目级联清除。
  // 这里不保存任何使用人字段：第一版不存在购买人与实际消耗人的区分（ADR-015）。
  `CREATE TABLE redemption_records (
     id                        TEXT NOT NULL PRIMARY KEY,
     purchase_item_id          TEXT NOT NULL REFERENCES purchase_items (id) ON DELETE CASCADE,
     institution_id            TEXT REFERENCES institutions (id) ON DELETE RESTRICT,
     institution_name_snapshot TEXT,
     city_snapshot             TEXT,
     redeemed_on               TEXT NOT NULL
                                    CHECK (redeemed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
     status                    TEXT NOT NULL DEFAULT 'active'
                                    CHECK (status IN (${STATUS_VALUES_SQL})),
     notes                     TEXT,
     created_at                TEXT NOT NULL,
     updated_at                TEXT NOT NULL,
     voided_at                 TEXT,
     void_reason               TEXT,
     CHECK (
       (status = 'active' AND voided_at IS NULL)
       OR (status = 'void' AND voided_at IS NOT NULL)
     )
   )`,
];

/**
 * V1 索引。
 *
 * 只为真实存在的关联与筛选路径建索引，不为每一列建索引。
 */
const V1_INDEXES: readonly string[] = [
  // 硬保证「只可能有一个默认档案」：部分唯一索引只约束 is_default = 1 的行。
  `CREATE UNIQUE INDEX idx_profiles_single_default
     ON profiles (is_default) WHERE is_default = 1`,

  // 机构选择器：按档案列出未归档机构并按名称排序。
  `CREATE INDEX idx_institutions_profile_archived_name
     ON institutions (profile_id, is_archived, normalized_name)`,
  // 机构搜索与重名检测：不区分归档状态。
  `CREATE INDEX idx_institutions_profile_name
     ON institutions (profile_id, normalized_name)`,

  // 记录列表默认视图：按档案取套餐，按购买日期倒序。
  `CREATE INDEX idx_purchases_profile_date
     ON purchases (profile_id, purchase_date DESC)`,
  // 「按机构」统计与外键反查。
  `CREATE INDEX idx_purchases_institution
     ON purchases (institution_id)`,
  // 临期与过期筛选：有效期为空的行不入索引，不参与筛选（PRD-PUR-007）。
  `CREATE INDEX idx_purchases_profile_expires
     ON purchases (profile_id, expires_on)
     WHERE expires_on IS NOT NULL`,

  // 套餐详情：按套餐取项目；同时服务外键反查。
  `CREATE INDEX idx_purchase_items_purchase
     ON purchase_items (purchase_id)`,

  // 余次计算：按项目数 status = 'active' 的核销条数。
  `CREATE INDEX idx_redemptions_item_status
     ON redemption_records (purchase_item_id, status)`,
  // 核销历史：按业务日期倒序浏览有效记录。
  `CREATE INDEX idx_redemptions_status_date
     ON redemption_records (status, redeemed_on DESC)`,
  // 「按机构」统计与外键反查。
  `CREATE INDEX idx_redemptions_institution
     ON redemption_records (institution_id)`,
];

/**
 * V1：建立核心表、约束、索引，并写入唯一的默认档案。
 */
const migration001: Migration = {
  version: 1,
  name: 'initial-schema',
  up: async (txn) => {
    for (const statement of V1_TABLES) {
      await txn.execAsync(statement);
    }
    for (const statement of V1_INDEXES) {
      await txn.execAsync(statement);
    }

    // 唯一允许创建的默认数据：一个默认档案（ADR-015）。
    // ID 固定 + 主键 + INSERT OR IGNORE，重复执行不会产生第二条。
    const now = new Date().toISOString();
    await txn.runAsync(
      `INSERT OR IGNORE INTO profiles (id, display_name, is_default, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
      [DEFAULT_PROFILE_ID, DEFAULT_PROFILE_DISPLAY_NAME, now, now],
    );
  },
};

/**
 * V2 建表语句：心愿单。
 *
 * 心愿是**用户主动记下的关注对象**，不是系统推荐，也不是医疗建议
 * （PRD 第 11 章、ADR-009）。因此这张表只存用户自己填的字段：
 * - 不存完成状态、优先级、提醒时间，首版没有这些概念；
 * - 不存机构名称快照，列表显示机构当前名称（与购买、核销刻意相反：
 *   购买与核销记录的是「那一次发生时的事实」，心愿记录的是「现在想去哪」）；
 * - 不存任何派生数据。
 *
 * `category` 直接复用套餐项目的分类取值，不另起一套同义分类。
 * `institution_id` 与 `purchases`、`redemption_records` 同口径用 ON DELETE RESTRICT：
 * 机构没有删除入口，生命周期由归档管理（ADR-014、ADR-016），
 * RESTRICT 保证不会出现悬空引用，也不会悄悄把用户填的机构清成空。
 * 归档只影响选择列表，不影响既有关联，因此归档后这条心愿仍然指向原机构。
 */
const V2_TABLES: readonly string[] = [
  `CREATE TABLE wishlist_items (
     id             TEXT    NOT NULL PRIMARY KEY,
     profile_id     TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     name           TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     category       TEXT    CHECK (category IS NULL OR category IN (${CATEGORY_VALUES_SQL})),
     institution_id TEXT    REFERENCES institutions (id) ON DELETE RESTRICT,
     planned_on     TEXT    CHECK (
                              planned_on IS NULL
                              OR planned_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                            ),
     budget_minor   INTEGER CHECK (budget_minor IS NULL OR budget_minor >= 0),
     notes          TEXT,
     created_at     TEXT    NOT NULL,
     updated_at     TEXT    NOT NULL
   )`,
];

/**
 * V2 索引。
 *
 * 只建一条：心愿单列表是本表唯一的查询路径，按档案取、按
 * `updated_at DESC, created_at DESC, id DESC` 排序。索引列写成 ASC，
 * SQLite 反向扫描同一索引即可满足倒序，不需要第二条索引。
 *
 * 刻意**不为** `institution_id` 建索引：机构没有删除入口，
 * 不存在父表删除时反查子表的场景，也没有「按机构筛选心愿」的功能。
 */
const V2_INDEXES: readonly string[] = [
  `CREATE INDEX idx_wishlist_items_profile_updated
     ON wishlist_items (profile_id, updated_at, created_at, id)`,
];

/**
 * V2：新增心愿单表。
 *
 * 只创建新结构，不触碰 V1 的任何表、外键与数据：
 * 升级后档案、机构、套餐、套餐项目与核销记录原样保留。
 */
const migration002: Migration = {
  version: 2,
  name: 'wishlist-items',
  up: async (txn) => {
    for (const statement of V2_TABLES) {
      await txn.execAsync(statement);
    }
    for (const statement of V2_INDEXES) {
      await txn.execAsync(statement);
    }
  },
};

/**
 * V3 建表语句：百科收藏。
 *
 * 只记录「当前档案收藏了哪篇文章」。百科正文随 App 打包，是本地只读内容，
 * 因此这张表**不复制**标题、摘要、分类与正文：复制一份进库，内容更新后
 * 库里那份立刻过时，两处就会各说各话。库里只留稳定的 `article_slug`，
 * 展示时回本地内容取当前文本。
 *
 * `article_slug` 刻意**不建外键**：被引用的一侧根本不是数据库表，
 * 为本地 TypeScript 内容伪造一张文章表只会带来一个需要持续同步的影子副本。
 * 文章被下架后留下的孤儿 slug 由 service 层安全忽略，不会渲染出假文章。
 *
 * 主键用复合主键 `(profile_id, article_slug)`：
 * - 这一对就是一条收藏的身份，没有任何表引用它，不需要额外的代理键；
 * - SQLite 会为复合主键建唯一索引，这正是「同一档案同一篇文章只能有一条收藏」
 *   所需要的唯一约束，因此不再另建一条 UNIQUE 索引；
 * - 重复收藏因此在**存储层**就不可能产生第二行，不依赖上层先查后写。
 */
const V3_TABLES: readonly string[] = [
  `CREATE TABLE catalog_favorites (
     profile_id   TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     article_slug TEXT NOT NULL CHECK (length(trim(article_slug)) > 0),
     created_at   TEXT NOT NULL,
     PRIMARY KEY (profile_id, article_slug)
   )`,
];

/**
 * V3 索引。
 *
 * 只建一条：收藏列表按档案取、按 `created_at DESC, article_slug DESC` 排序，
 * 而复合主键的索引是 `(profile_id, article_slug)`，帮不上这个排序。
 * 索引列写成 ASC，SQLite 反向扫描同一索引即可满足倒序。
 *
 * 判重、查询单篇状态与取消收藏都走主键索引，不需要第三条索引。
 */
const V3_INDEXES: readonly string[] = [
  `CREATE INDEX idx_catalog_favorites_profile_created
     ON catalog_favorites (profile_id, created_at, article_slug)`,
];

/**
 * V3：新增百科收藏表。
 *
 * 只创建新结构，不触碰 V1 与 V2 的任何表、外键与数据：升级后档案、机构、套餐、
 * 套餐项目、核销记录与心愿全部原样保留。特别地，**不给 `wishlist_items` 加列**：
 * 从文章进入新增心愿只是一次预填，保存下来的心愿与手动新增的完全一样，
 * 不与文章保持长期绑定（任务书第 3.2、8.1 节）。
 *
 * 首次初始化不写入任何示例收藏。
 */
const migration003: Migration = {
  version: 3,
  name: 'catalog-favorites',
  up: async (txn) => {
    for (const statement of V3_TABLES) {
      await txn.execAsync(statement);
    }
    for (const statement of V3_INDEXES) {
      await txn.execAsync(statement);
    }
  },
};

/**
 * 全部迁移，按 version 升序。新增 V4、V5 时在数组末尾追加一个 `Migration`，
 * 不要改动已有条目。
 */
export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];

/** 当前代码期望的 schema 版本。从迁移列表派生，不手工维护，避免与实际迁移脱节。 */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);
