import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CURRENCY, PURCHASE_KINDS, USAGE_SOURCE_KINDS } from './constants';
import {
  buildSelfPerson,
  LegacyConversionError,
  toV4EventAndUsage,
  toV4Institution,
  toV4Purchase,
  toV4PurchaseItem,
  type InstitutionRowV3,
  type PurchaseItemRowV3,
  type PurchaseRowV3,
  type RedemptionRecordRowV3,
} from './legacy-mapping';
import type { InstitutionRow, Migration, PersonRow, ProfileRow } from './types';

/**
 * V4：变美记录与套餐资产分离（DATA_MODEL_V4 第 4、10 章，ADR-020 至 ADR-024）。
 *
 * 在一个事务里依次完成（第 10.2 节）：
 * 1. `institutions` 追加三个地点列；新建 `people`、`purchases_v4`、`purchase_items_v4`、
 *    `beauty_events`、`usage_records`，新表之间的外键指向 `_v4` 新表名；
 * 2. 用 `legacy-mapping` 的纯函数搬运数据——备份 v1 → v2 转换调用的是同一组函数；
 * 3. 自查（第 10.5 节），任一条不成立即抛出，整个事务回滚，库保持 v3；
 * 4. 子表在前删除旧表：`redemption_records`、`purchase_items`、`purchases`；
 * 5. `_v4` 表改回正式名称（`legacy_alter_table = OFF` 会同步改写指向它们的外键）；
 * 6. 建索引并再做一次引用完整性自查。`user_version = 4` 由 `initialize-database.ts`
 *    在 `up` 成功返回后于同一事务内写入。
 *
 * 顺序保证原生（独占事务、新连接、外键不生效）与 Web 预览（主连接、外键生效、
 * `DROP TABLE` 会隐式删除并级联）两端都安全：删除旧表时，没有任何新表引用旧表。
 *
 * 不合并旧核销、不自动平衡金额、不改写任何快照、不用普通别名做映射。
 * 自查失败的消息只写规则名称，不包含任何用户数据。
 */

const DATE_GLOB = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";

const PURCHASE_KIND_VALUES_SQL = PURCHASE_KINDS.map((kind) => `'${kind}'`).join(', ');
const SOURCE_KIND_VALUES_SQL = USAGE_SOURCE_KINDS.map((kind) => `'${kind}'`).join(', ');

/** 第 4.7 节：追加顺序固定，每条 CHECK 只引用已经存在的列。 */
const V4_INSTITUTION_COLUMNS: readonly string[] = [
  `ALTER TABLE institutions ADD COLUMN province_code TEXT
     CHECK (province_code IS NULL OR length(province_code) > 0)`,
  `ALTER TABLE institutions ADD COLUMN province_name TEXT
     CHECK ((province_code IS NULL AND province_name IS NULL)
         OR (province_code IS NOT NULL AND length(trim(province_name)) > 0
             AND city IS NOT NULL AND length(trim(city)) > 0))`,
  `ALTER TABLE institutions ADD COLUMN city_code TEXT
     CHECK (city_code IS NULL
         OR (province_code IS NOT NULL AND province_name IS NOT NULL
             AND city IS NOT NULL AND length(trim(city)) > 0))`,
];

const V4_TABLES: readonly string[] = [
  // 人：同一档案下的购买人与使用人，不登录、不持有凭证（ADR-022）。
  `CREATE TABLE people (
     id              TEXT    NOT NULL PRIMARY KEY,
     profile_id      TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     display_name    TEXT    NOT NULL CHECK (length(trim(display_name)) > 0),
     normalized_name TEXT    NOT NULL CHECK (length(normalized_name) > 0),
     is_self         INTEGER NOT NULL DEFAULT 0 CHECK (is_self IN (0, 1)),
     status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
     created_at      TEXT    NOT NULL,
     updated_at      TEXT    NOT NULL,
     CHECK (is_self = 0 OR status = 'active')
   )`,

  // 购买：相对 v3 新增购买类型、购买人与购买人名称快照（第 4.3 节）。
  `CREATE TABLE purchases_v4 (
     id                        TEXT    NOT NULL PRIMARY KEY,
     profile_id                TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     purchase_kind             TEXT    NOT NULL DEFAULT 'package'
                                       CHECK (purchase_kind IN (${PURCHASE_KIND_VALUES_SQL})),
     purchaser_person_id       TEXT    NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
     purchaser_name_snapshot   TEXT    NOT NULL CHECK (length(trim(purchaser_name_snapshot)) > 0),
     institution_id            TEXT    REFERENCES institutions (id) ON DELETE RESTRICT,
     institution_name_snapshot TEXT,
     city_snapshot             TEXT,
     name                      TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     purchase_date             TEXT    NOT NULL CHECK (purchase_date GLOB ${DATE_GLOB}),
     total_amount_minor        INTEGER NOT NULL CHECK (total_amount_minor >= 0),
     currency                  TEXT    NOT NULL DEFAULT '${DEFAULT_CURRENCY}' CHECK (length(currency) = 3),
     expires_on                TEXT    CHECK (expires_on IS NULL OR expires_on GLOB ${DATE_GLOB}),
     notes                     TEXT,
     created_at                TEXT    NOT NULL,
     updated_at                TEXT    NOT NULL,
     CHECK (expires_on IS NULL OR expires_on >= purchase_date)
   )`,

  // 套餐项目：分配总额是金额的唯一事实（ADR-023）；分类与项目代码不在库里枚举（ADR-024）。
  `CREATE TABLE purchase_items_v4 (
     id                     TEXT    NOT NULL PRIMARY KEY,
     purchase_id            TEXT    NOT NULL REFERENCES purchases_v4 (id) ON DELETE CASCADE,
     name                   TEXT    NOT NULL CHECK (length(trim(name)) > 0),
     category_code          TEXT    NOT NULL CHECK (length(category_code) > 0),
     service_code           TEXT    CHECK (service_code IS NULL OR length(service_code) > 0),
     custom_name            TEXT    CHECK (custom_name IS NULL OR length(trim(custom_name)) > 0),
     quantity               INTEGER NOT NULL CHECK (quantity > 0),
     allocated_amount_minor INTEGER NOT NULL CHECK (allocated_amount_minor >= 0),
     notes                  TEXT,
     created_at             TEXT    NOT NULL,
     updated_at             TEXT    NOT NULL,
     CHECK (service_code IS NOT NULL OR custom_name IS NOT NULL)
   )`,

  // 变美记录：一次真实到店，没有使用人、金额与余次（ADR-020）。
  `CREATE TABLE beauty_events (
     id                        TEXT NOT NULL PRIMARY KEY,
     profile_id                TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
     occurred_on               TEXT NOT NULL CHECK (occurred_on GLOB ${DATE_GLOB}),
     institution_id            TEXT REFERENCES institutions (id) ON DELETE RESTRICT,
     institution_name_snapshot TEXT,
     province_code_snapshot    TEXT,
     province_name_snapshot    TEXT,
     city_code_snapshot        TEXT,
     city_name_snapshot        TEXT,
     notes                     TEXT,
     created_at                TEXT NOT NULL,
     updated_at                TEXT NOT NULL,
     CHECK ((province_code_snapshot IS NULL AND province_name_snapshot IS NULL)
         OR (province_code_snapshot IS NOT NULL AND province_name_snapshot IS NOT NULL)),
     CHECK (city_code_snapshot IS NULL
         OR (province_code_snapshot IS NOT NULL AND city_name_snapshot IS NOT NULL))
   )`,

  // 使用记录：一行 = 一次使用；作废只发生在这一层；删除套餐时改为 deleted_package（ADR-021）。
  `CREATE TABLE usage_records (
     id                          TEXT NOT NULL PRIMARY KEY,
     event_id                    TEXT NOT NULL REFERENCES beauty_events (id) ON DELETE CASCADE,
     source_kind                 TEXT NOT NULL CHECK (source_kind IN (${SOURCE_KIND_VALUES_SQL})),
     purchase_item_id            TEXT REFERENCES purchase_items_v4 (id) ON DELETE RESTRICT,
     person_id                   TEXT NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
     person_name_snapshot        TEXT NOT NULL CHECK (length(trim(person_name_snapshot)) > 0),
     category_code_snapshot      TEXT NOT NULL CHECK (length(category_code_snapshot) > 0),
     service_code_snapshot       TEXT,
     service_name_snapshot       TEXT,
     custom_name_snapshot        TEXT,
     purchase_name_snapshot      TEXT,
     purchase_item_name_snapshot TEXT,
     status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
     voided_at                   TEXT,
     void_reason                 TEXT,
     notes                       TEXT,
     created_at                  TEXT NOT NULL,
     updated_at                  TEXT NOT NULL,
     CHECK ((status = 'active' AND voided_at IS NULL AND void_reason IS NULL)
         OR (status = 'void'   AND voided_at IS NOT NULL)),
     CHECK ((source_kind IN ('package_item', 'single_purchase') AND purchase_item_id IS NOT NULL)
         OR (source_kind IN ('external', 'unlinked', 'deleted_package') AND purchase_item_id IS NULL)),
     CHECK (service_code_snapshot IS NULL OR service_name_snapshot IS NOT NULL),
     CHECK (service_code_snapshot IS NOT NULL OR custom_name_snapshot IS NOT NULL),
     CHECK (source_kind IN ('external', 'unlinked')
         OR (purchase_name_snapshot IS NOT NULL AND length(trim(purchase_name_snapshot)) > 0
             AND purchase_item_name_snapshot IS NOT NULL
             AND length(trim(purchase_item_name_snapshot)) > 0))
   )`,
];

/** 子表在前。三张旧表的索引随表一起删除，包括全部 `idx_redemptions_*`。 */
const V3_TABLES_TO_DROP: readonly string[] = [
  'DROP TABLE redemption_records',
  'DROP TABLE purchase_items',
  'DROP TABLE purchases',
];

const V4_RENAMES: readonly string[] = [
  'ALTER TABLE purchases_v4 RENAME TO purchases',
  'ALTER TABLE purchase_items_v4 RENAME TO purchase_items',
];

const V4_INDEXES: readonly string[] = [
  `CREATE UNIQUE INDEX idx_people_single_self ON people (profile_id) WHERE is_self = 1`,
  `CREATE UNIQUE INDEX idx_people_profile_name ON people (profile_id, normalized_name)`,

  // 沿用 v3 的三条购买索引，新增购买人反查。
  `CREATE INDEX idx_purchases_profile_date ON purchases (profile_id, purchase_date DESC)`,
  `CREATE INDEX idx_purchases_institution ON purchases (institution_id)`,
  `CREATE INDEX idx_purchases_profile_expires
     ON purchases (profile_id, expires_on)
     WHERE expires_on IS NOT NULL`,
  `CREATE INDEX idx_purchases_purchaser ON purchases (purchaser_person_id)`,

  `CREATE INDEX idx_purchase_items_purchase ON purchase_items (purchase_id)`,
  `CREATE INDEX idx_purchase_items_service ON purchase_items (category_code, service_code)`,

  `CREATE INDEX idx_beauty_events_profile_date ON beauty_events (profile_id, occurred_on DESC)`,
  `CREATE INDEX idx_beauty_events_institution ON beauty_events (institution_id)`,

  `CREATE INDEX idx_usage_records_event ON usage_records (event_id)`,
  `CREATE INDEX idx_usage_records_person ON usage_records (person_id)`,
  `CREATE INDEX idx_usage_records_item_status ON usage_records (purchase_item_id, status)`,
];

/** 自查不通过。消息只含规则名称。 */
export class MigrationCheckError extends Error {
  constructor(rule: string) {
    super(`v4 迁移自查未通过：${rule}`);
    this.name = 'MigrationCheckError';
  }
}

/** 一条自查：返回违规行数的 SQL，结果列名固定为 `n`。 */
type SqlCheck = readonly [rule: string, sql: string];

async function runChecks(txn: SQLiteDatabase, checks: readonly SqlCheck[]): Promise<void> {
  for (const [rule, sql] of checks) {
    const row = await txn.getFirstAsync<{ n: number }>(sql);
    if (row === null || row.n !== 0) {
      throw new MigrationCheckError(rule);
    }
  }
}

/** 机构地点只允许 A、B、C 三种组合（第 4.7 节）。 */
const INSTITUTION_LOCATION_CHECK: SqlCheck = [
  '机构地点组合合法',
  `SELECT COUNT(*) AS n FROM institutions
    WHERE (province_code IS NULL) <> (province_name IS NULL)
       OR (city_code IS NOT NULL AND province_code IS NULL)
       OR (province_code IS NOT NULL AND (city IS NULL OR length(trim(city)) = 0))`,
];

/**
 * 第 10.5 节：`user_version = 4` 之前、旧表仍在时的逐行对照。
 * 表名参数让同一组「孤儿 / 跨档案」检查在重命名前后各跑一次。
 */
function referenceChecks(purchases: string, items: string): readonly SqlCheck[] {
  return [
    ['每个档案恰好一个「自己」', `SELECT COUNT(*) AS n FROM profiles p
       WHERE (SELECT COUNT(*) FROM people s WHERE s.profile_id = p.id AND s.is_self = 1) <> 1`],
    ['「自己」均为使用中', `SELECT COUNT(*) AS n FROM people WHERE is_self = 1 AND status <> 'active'`],
    ['人员不缺档案', `SELECT COUNT(*) AS n FROM people s LEFT JOIN profiles p ON p.id = s.profile_id
       WHERE p.id IS NULL`],
    ['项目不缺套餐', `SELECT COUNT(*) AS n FROM ${items} i LEFT JOIN ${purchases} p ON p.id = i.purchase_id
       WHERE p.id IS NULL`],
    ['使用记录不缺变美记录', `SELECT COUNT(*) AS n FROM usage_records u
       LEFT JOIN beauty_events e ON e.id = u.event_id WHERE e.id IS NULL`],
    ['使用记录不缺使用人', `SELECT COUNT(*) AS n FROM usage_records u
       LEFT JOIN people s ON s.id = u.person_id WHERE s.id IS NULL`],
    ['使用记录的来源项目存在', `SELECT COUNT(*) AS n FROM usage_records u
       LEFT JOIN ${items} i ON i.id = u.purchase_item_id
       WHERE u.purchase_item_id IS NOT NULL AND i.id IS NULL`],
    ['购买不缺购买人', `SELECT COUNT(*) AS n FROM ${purchases} p
       LEFT JOIN people s ON s.id = p.purchaser_person_id WHERE s.id IS NULL`],
    ['购买的机构存在', `SELECT COUNT(*) AS n FROM ${purchases} p
       LEFT JOIN institutions t ON t.id = p.institution_id
       WHERE p.institution_id IS NOT NULL AND t.id IS NULL`],
    ['变美记录的机构存在', `SELECT COUNT(*) AS n FROM beauty_events e
       LEFT JOIN institutions t ON t.id = e.institution_id
       WHERE e.institution_id IS NOT NULL AND t.id IS NULL`],
    ['变美记录不缺档案', `SELECT COUNT(*) AS n FROM beauty_events e
       LEFT JOIN profiles p ON p.id = e.profile_id WHERE p.id IS NULL`],
    ['使用人与变美记录同档案', `SELECT COUNT(*) AS n FROM usage_records u
       JOIN beauty_events e ON e.id = u.event_id
       JOIN people s ON s.id = u.person_id
       WHERE s.profile_id <> e.profile_id`],
    ['来源项目与变美记录同档案', `SELECT COUNT(*) AS n FROM usage_records u
       JOIN beauty_events e ON e.id = u.event_id
       JOIN ${items} i ON i.id = u.purchase_item_id
       JOIN ${purchases} p ON p.id = i.purchase_id
       WHERE p.profile_id <> e.profile_id`],
    ['购买人与购买同档案', `SELECT COUNT(*) AS n FROM ${purchases} p
       JOIN people s ON s.id = p.purchaser_person_id WHERE s.profile_id <> p.profile_id`],
    ['来源类型与购买类型一致', `SELECT COUNT(*) AS n FROM usage_records u
       JOIN ${items} i ON i.id = u.purchase_item_id
       JOIN ${purchases} p ON p.id = i.purchase_id
       WHERE (u.source_kind = 'package_item' AND p.purchase_kind <> 'package')
          OR (u.source_kind = 'single_purchase' AND p.purchase_kind <> 'single')`],
    ['金额与次数合法', `SELECT
         (SELECT COUNT(*) FROM ${purchases} WHERE total_amount_minor < 0)
       + (SELECT COUNT(*) FROM ${items}
           WHERE allocated_amount_minor < 0 OR quantity < 1 OR typeof(quantity) <> 'integer'
              OR typeof(allocated_amount_minor) <> 'integer') AS n`],
    ['项目有目录代码或自定义名称', `SELECT COUNT(*) AS n FROM ${items}
       WHERE service_code IS NULL AND custom_name IS NULL`],
    // 刻意不检查「有效使用次数 ≤ 购买次数」：历史数据可能已经超用（例如 v3 时期补录多于购买次数），
    // 迁移、备份校验与恢复都原样保留它，显示时逐项按 MAX(0, 购买次数 − 有效次数) 计算；
    // 只有新增有效使用的写入路径阻止超用（DATA_MODEL_V4 第 11.4 节）。
    // 迁移只保证每个项目的有效次数与升级前相等（见上一组检查）。
    INSTITUTION_LOCATION_CHECK,
  ];
}

/** 旧表仍在时才能做的逐行对照（第 10.5 节）。 */
const MIGRATION_EQUIVALENCE_CHECKS: readonly SqlCheck[] = [
  ['购买行数不变', `SELECT (SELECT COUNT(*) FROM purchases) - (SELECT COUNT(*) FROM purchases_v4) AS n`],
  ['套餐总价之和不变', `SELECT CASE WHEN (SELECT COALESCE(SUM(total_amount_minor), 0) FROM purchases)
                                  = (SELECT COALESCE(SUM(total_amount_minor), 0) FROM purchases_v4)
                             THEN 0 ELSE 1 END AS n`],
  ['购买逐行一致', `SELECT COUNT(*) AS n FROM purchases o LEFT JOIN purchases_v4 v ON v.id = o.id
     WHERE v.id IS NULL
        OR v.profile_id IS NOT o.profile_id
        OR v.purchase_kind <> 'package'
        OR v.institution_id IS NOT o.institution_id
        OR v.institution_name_snapshot IS NOT o.institution_name_snapshot
        OR v.city_snapshot IS NOT o.city_snapshot
        OR v.name IS NOT o.name
        OR v.purchase_date IS NOT o.purchase_date
        OR v.total_amount_minor IS NOT o.total_amount_minor
        OR v.currency IS NOT o.currency
        OR v.expires_on IS NOT o.expires_on
        OR v.notes IS NOT o.notes
        OR v.created_at IS NOT o.created_at
        OR v.updated_at IS NOT o.updated_at`],
  ['购买人为本档案的「自己」', `SELECT COUNT(*) AS n FROM purchases_v4 v
     LEFT JOIN people s ON s.id = v.purchaser_person_id AND s.is_self = 1 AND s.profile_id = v.profile_id
     WHERE s.id IS NULL OR v.purchaser_name_snapshot IS NOT s.display_name`],
  ['项目行数不变', `SELECT (SELECT COUNT(*) FROM purchase_items) - (SELECT COUNT(*) FROM purchase_items_v4) AS n`],
  ['项目逐行一致且分配金额 = 单价 × 次数', `SELECT COUNT(*) AS n FROM purchase_items o
     LEFT JOIN purchase_items_v4 v ON v.id = o.id
     WHERE v.id IS NULL
        OR v.purchase_id IS NOT o.purchase_id
        OR v.name IS NOT o.name
        OR v.quantity IS NOT o.quantity
        OR v.allocated_amount_minor IS NOT o.unit_amount_minor * o.quantity
        OR v.notes IS NOT o.notes
        OR v.created_at IS NOT o.created_at
        OR v.updated_at IS NOT o.updated_at`],
  ['变美记录数 = 使用记录数 = 旧核销数', `SELECT
       ABS((SELECT COUNT(*) FROM beauty_events) - (SELECT COUNT(*) FROM redemption_records))
     + ABS((SELECT COUNT(*) FROM usage_records) - (SELECT COUNT(*) FROM redemption_records)) AS n`],
  ['每条旧核销恰好对应一个同 ID 变美记录', `SELECT COUNT(*) AS n FROM redemption_records r
     LEFT JOIN beauty_events e ON e.id = r.id
     WHERE e.id IS NULL
        OR e.occurred_on IS NOT r.redeemed_on
        OR e.institution_id IS NOT r.institution_id
        OR e.institution_name_snapshot IS NOT r.institution_name_snapshot
        OR e.city_name_snapshot IS NOT r.city_snapshot
        OR e.notes IS NOT NULL
        OR e.created_at IS NOT r.created_at
        OR e.updated_at IS NOT r.updated_at`],
  ['每条旧核销恰好对应一条同 ID 使用记录', `SELECT COUNT(*) AS n FROM redemption_records r
     LEFT JOIN usage_records u ON u.id = r.id
     WHERE u.id IS NULL
        OR u.event_id IS NOT r.id
        OR u.source_kind <> 'package_item'
        OR u.purchase_item_id IS NOT r.purchase_item_id
        OR u.status IS NOT r.status
        OR u.voided_at IS NOT r.voided_at
        OR u.void_reason IS NOT r.void_reason
        OR u.notes IS NOT r.notes
        OR u.created_at IS NOT r.created_at
        OR u.updated_at IS NOT r.updated_at`],
  ['使用记录快照取自旧套餐与旧项目', `SELECT COUNT(*) AS n FROM usage_records u
     JOIN purchase_items o ON o.id = u.purchase_item_id
     JOIN purchases p ON p.id = o.purchase_id
     JOIN purchase_items_v4 v ON v.id = o.id
     WHERE u.purchase_item_name_snapshot IS NOT o.name
        OR u.purchase_name_snapshot IS NOT p.name
        OR u.category_code_snapshot IS NOT v.category_code
        OR u.service_code_snapshot IS NOT v.service_code
        OR u.custom_name_snapshot IS NOT v.custom_name`],
  ['变美记录档案取自旧套餐', `SELECT COUNT(*) AS n FROM redemption_records r
     JOIN purchase_items o ON o.id = r.purchase_item_id
     JOIN purchases p ON p.id = o.purchase_id
     JOIN beauty_events e ON e.id = r.id
     WHERE e.profile_id IS NOT p.profile_id`],
  ['每个项目的有效次数不变', `SELECT COUNT(*) AS n FROM purchase_items o
     WHERE (SELECT COUNT(*) FROM usage_records u WHERE u.purchase_item_id = o.id AND u.status = 'active')
        <> (SELECT COUNT(*) FROM redemption_records r WHERE r.purchase_item_id = o.id AND r.status = 'active')`],
  ['迁移只产生套餐类购买', `SELECT COUNT(*) AS n FROM purchases_v4 WHERE purchase_kind <> 'package'`],
];

/** 重命名之后：旧表已不存在，`_v4` 表也不应残留。 */
const FINAL_SCHEMA_CHECKS: readonly SqlCheck[] = [
  ['旧表与临时表已清除', `SELECT COUNT(*) AS n FROM sqlite_master
     WHERE name IN ('redemption_records', 'purchases_v4', 'purchase_items_v4')
        OR name LIKE 'idx_redemptions_%'`],
];

const INSTITUTION_COLUMNS_V3 =
  'id, profile_id, name, normalized_name, city, notes, is_archived, created_at, updated_at';

function sameInstitutionV3(before: InstitutionRowV3, after: InstitutionRow): boolean {
  return (
    before.id === after.id &&
    before.profile_id === after.profile_id &&
    before.name === after.name &&
    before.normalized_name === after.normalized_name &&
    before.city === after.city &&
    before.notes === after.notes &&
    before.is_archived === after.is_archived &&
    before.created_at === after.created_at &&
    before.updated_at === after.updated_at
  );
}

async function up(txn: SQLiteDatabase): Promise<void> {
  // 旧数据按 ID 升序一次读入，搬运结果与读取顺序无关，但插入顺序稳定便于排查。
  const profiles = await txn.getAllAsync<Pick<ProfileRow, 'id' | 'created_at'>>(
    'SELECT id, created_at FROM profiles ORDER BY id',
  );
  const institutionsBefore = await txn.getAllAsync<InstitutionRowV3>(
    `SELECT ${INSTITUTION_COLUMNS_V3} FROM institutions ORDER BY id`,
  );
  const purchases = await txn.getAllAsync<PurchaseRowV3>(
    `SELECT id, profile_id, institution_id, institution_name_snapshot, city_snapshot, name,
            purchase_date, total_amount_minor, currency, expires_on, notes, created_at, updated_at
       FROM purchases ORDER BY id`,
  );
  // 项目按 rowid 读、按同样顺序插入新表：同一套餐的项目 created_at 完全相同，
  // 界面靠 `created_at, rowid` 保持录入顺序，重建表之后这个顺序必须不变。
  const items = await txn.getAllAsync<PurchaseItemRowV3>(
    `SELECT id, purchase_id, name, category, quantity, unit_amount_minor, notes, created_at, updated_at
       FROM purchase_items ORDER BY rowid`,
  );
  const redemptions = await txn.getAllAsync<RedemptionRecordRowV3>(
    `SELECT id, purchase_item_id, institution_id, institution_name_snapshot, city_snapshot,
            redeemed_on, status, notes, created_at, updated_at, voided_at, void_reason
       FROM redemption_records ORDER BY id`,
  );

  for (const statement of V4_INSTITUTION_COLUMNS) {
    await txn.execAsync(statement);
  }
  for (const statement of V4_TABLES) {
    await txn.execAsync(statement);
  }

  // 人：每个档案一个「自己」。
  const selfByProfile = new Map<string, PersonRow>();
  for (const profile of profiles) {
    const self = buildSelfPerson(profile);
    selfByProfile.set(profile.id, self);
    await txn.runAsync(
      `INSERT INTO people (id, profile_id, display_name, normalized_name, is_self, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [self.id, self.profile_id, self.display_name, self.normalized_name, self.is_self, self.status,
        self.created_at, self.updated_at],
    );
  }
  const selfFor = (profileId: string): PersonRow => {
    const self = selfByProfile.get(profileId);
    if (self === undefined) {
      throw new LegacyConversionError('购买所属档案不存在');
    }
    return self;
  };

  // 机构：只补三个地点列，原有列与 updated_at 一律不动。
  for (const before of institutionsBefore) {
    const after = toV4Institution(before);
    if (after.province_code !== null) {
      await txn.runAsync(
        'UPDATE institutions SET province_code = ?, province_name = ?, city_code = ? WHERE id = ?',
        [after.province_code, after.province_name, after.city_code, after.id],
      );
    }
  }

  const purchaseById = new Map<string, PurchaseRowV3>();
  for (const purchase of purchases) {
    purchaseById.set(purchase.id, purchase);
    const row = toV4Purchase(purchase, selfFor(purchase.profile_id));
    await txn.runAsync(
      `INSERT INTO purchases_v4 (id, profile_id, purchase_kind, purchaser_person_id, purchaser_name_snapshot,
         institution_id, institution_name_snapshot, city_snapshot, name, purchase_date, total_amount_minor,
         currency, expires_on, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.profile_id, row.purchase_kind, row.purchaser_person_id, row.purchaser_name_snapshot,
        row.institution_id, row.institution_name_snapshot, row.city_snapshot, row.name, row.purchase_date,
        row.total_amount_minor, row.currency, row.expires_on, row.notes, row.created_at, row.updated_at],
    );
  }

  const itemById = new Map<string, PurchaseItemRowV3>();
  for (const item of items) {
    itemById.set(item.id, item);
    const row = toV4PurchaseItem(item);
    await txn.runAsync(
      `INSERT INTO purchase_items_v4 (id, purchase_id, name, category_code, service_code, custom_name,
         quantity, allocated_amount_minor, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.purchase_id, row.name, row.category_code, row.service_code, row.custom_name,
        row.quantity, row.allocated_amount_minor, row.notes, row.created_at, row.updated_at],
    );
  }

  // 每条旧核销 → 一个变美记录 + 一条使用记录，ID 复用，不合并。
  for (const redemption of redemptions) {
    const item = itemById.get(redemption.purchase_item_id);
    const purchase = item === undefined ? undefined : purchaseById.get(item.purchase_id);
    if (item === undefined || purchase === undefined) {
      throw new LegacyConversionError('核销指向不存在的套餐项目');
    }
    const { event, usage } = toV4EventAndUsage(redemption, item, purchase, selfFor(purchase.profile_id));
    await txn.runAsync(
      `INSERT INTO beauty_events (id, profile_id, occurred_on, institution_id, institution_name_snapshot,
         province_code_snapshot, province_name_snapshot, city_code_snapshot, city_name_snapshot, notes,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.profile_id, event.occurred_on, event.institution_id, event.institution_name_snapshot,
        event.province_code_snapshot, event.province_name_snapshot, event.city_code_snapshot,
        event.city_name_snapshot, event.notes, event.created_at, event.updated_at],
    );
    await txn.runAsync(
      `INSERT INTO usage_records (id, event_id, source_kind, purchase_item_id, person_id, person_name_snapshot,
         category_code_snapshot, service_code_snapshot, service_name_snapshot, custom_name_snapshot,
         purchase_name_snapshot, purchase_item_name_snapshot, status, voided_at, void_reason, notes,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [usage.id, usage.event_id, usage.source_kind, usage.purchase_item_id, usage.person_id,
        usage.person_name_snapshot, usage.category_code_snapshot, usage.service_code_snapshot,
        usage.service_name_snapshot, usage.custom_name_snapshot, usage.purchase_name_snapshot,
        usage.purchase_item_name_snapshot, usage.status, usage.voided_at, usage.void_reason, usage.notes,
        usage.created_at, usage.updated_at],
    );
  }

  // 自查（旧表仍在）。
  const institutionsAfter = await txn.getAllAsync<InstitutionRow>(
    `SELECT ${INSTITUTION_COLUMNS_V3}, province_code, province_name, city_code FROM institutions ORDER BY id`,
  );
  if (
    institutionsAfter.length !== institutionsBefore.length ||
    institutionsBefore.some((before, index) => !sameInstitutionV3(before, institutionsAfter[index]))
  ) {
    throw new MigrationCheckError('机构原有列逐行不变');
  }
  await runChecks(txn, MIGRATION_EQUIVALENCE_CHECKS);
  await runChecks(txn, referenceChecks('purchases_v4', 'purchase_items_v4'));

  for (const statement of V3_TABLES_TO_DROP) {
    await txn.execAsync(statement);
  }
  for (const statement of V4_RENAMES) {
    await txn.execAsync(statement);
  }
  for (const statement of V4_INDEXES) {
    await txn.execAsync(statement);
  }

  // 重命名与建索引之后再查一次：外键是否跟着改写到正式表名、引用是否仍然完整。
  await runChecks(txn, FINAL_SCHEMA_CHECKS);
  await runChecks(txn, referenceChecks('purchases', 'purchase_items'));
  for (const table of ['people', 'purchases', 'purchase_items', 'beauty_events', 'usage_records']) {
    const violations = await txn.getAllAsync(`PRAGMA foreign_key_check(${table})`);
    if (violations.length > 0) {
      throw new MigrationCheckError('新表外键引用完整');
    }
  }
}

export const migration004: Migration = {
  version: 4,
  name: 'beauty-events-and-assets',
  up,
};
