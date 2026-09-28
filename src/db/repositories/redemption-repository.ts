import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  RedemptionContextRow,
  RedemptionHistoryEntryRow,
  RedemptionHistoryRow,
  RedemptionRepository,
  RedemptionStatusFilter,
} from './types';

/**
 * 完整历史的查询语句。
 *
 * 三条语句在模块加载时一次拼好，之后按 `RedemptionStatusFilter` 查表取用。
 * 两个原因：
 *
 * 1. 不把过滤条件写成 `(? = 'all' OR u.status = ?)`。那样虽然也是绑定参数，
 *    但 status 列上的条件变成了运行期表达式，优化器无从利用。
 * 2. 参与拼接的只有本文件里的字面量，运行期没有任何值能进到 SQL 文本里。
 *    调用方传的 `filter` 只用作查表的键，不参与拼接。
 *
 * schema v4 起读的是 `usage_records` JOIN `beauty_events`（DATA_MODEL_V4 第 6、7 节）。
 * 档案归属经 `beauty_events.profile_id` 判断：使用记录不一定关联套餐，
 * 原套餐已删除的记录同样要出现在历史里（ADR-021）。
 *
 * 项目与套餐名称取使用记录上的快照，套餐 ID 通过 LEFT JOIN 当前项目取得：
 * 来源为套餐、单次购买或原套餐已删除时取套餐项目名称快照；外部来源与暂不关联
 * 取目录名称快照或自定义名称快照（DATA_MODEL_V4 第 7 节）。一律不读项目当前名称。
 * 来源不是套餐时项目为空，界面据此不提供跳转。机构与城市取变美记录自己的快照，
 * 套餐后来改机构不改写它（PRD-INST-005、PRD-PUR-018）。
 */
const HISTORY_SELECT = `SELECT
    u.id,
    u.source_kind,
    u.purchase_item_id,
    CASE WHEN u.source_kind IN ('package_item', 'single_purchase', 'deleted_package')
         THEN u.purchase_item_name_snapshot
         ELSE COALESCE(u.service_name_snapshot, u.custom_name_snapshot)
    END AS item_name,
    i.purchase_id AS purchase_id,
    u.purchase_name_snapshot AS purchase_name,
    e.occurred_on AS redeemed_on,
    u.status,
    e.institution_name_snapshot,
    e.city_name_snapshot AS city_snapshot,
    u.notes,
    u.person_name_snapshot,
    u.created_at,
    u.voided_at,
    u.void_reason
   FROM usage_records u
   JOIN beauty_events e ON e.id = u.event_id
   LEFT JOIN purchase_items i ON i.id = u.purchase_item_id
  WHERE e.profile_id = ?`;

/** 稳定排序：事件日期倒序，同日按创建时间倒序，再同则按 ID 倒序（任务书第六节）。 */
const HISTORY_ORDER = `
  ORDER BY e.occurred_on DESC, u.created_at DESC, u.id DESC`;

const HISTORY_STATEMENTS: Readonly<Record<RedemptionStatusFilter, string>> = {
  all: `${HISTORY_SELECT}${HISTORY_ORDER}`,
  active: `${HISTORY_SELECT} AND u.status = 'active'${HISTORY_ORDER}`,
  void: `${HISTORY_SELECT} AND u.status = 'void'${HISTORY_ORDER}`,
};

/**
 * 「核销」兼容层的 SQLite 实现。
 *
 * 名字沿用 redemption，是为了让现有页面与 service 不改接口；底下读写的已经是
 * `beauty_events` 与 `usage_records`，旧的核销表在 schema v4 中已经退役。
 *
 * 所有运行期的值都走参数绑定，SQL 文本里不出现任何调用方传入的内容
 * （上面三条历史语句由本文件的字面量在模块加载时拼成，理由见其注释）。
 *
 * 这一层只负责「怎么读写这两张表」，不判断余次够不够、不决定机构怎么继承——
 * 那些是业务规则，属于 service（ARCHITECTURE 第三节）。
 */
export function createRedemptionRepository(db: SQLiteDatabase): RedemptionRepository {
  return {
    async countActiveByItem(purchaseItemId) {
      // `status = 'active'` 是写死在 SQL 里的常量而不是绑定参数：余次的定义只有
      // 这一种，把它做成参数等于允许调用方按别的状态算余次。
      // 命中 idx_usage_records_item_status (purchase_item_id, status)。
      const row = await db.getFirstAsync<{ active_count: number }>(
        `SELECT COUNT(*) AS active_count
           FROM usage_records
          WHERE purchase_item_id = ? AND status = 'active'`,
        [purchaseItemId],
      );
      return row?.active_count ?? 0;
    },

    async listByPurchase(purchaseId) {
      // 已撤销的记录同样返回：它们要在历史里继续可见并标注（ADR-016），
      // 只是不参与余次计算。项目名称取使用记录上的快照，不取项目当前的名称：
      // 项目后来改名，历史仍显示当时的名称（DATA_MODEL_V4 第 5 节）。
      // JOIN 当前项目只用来按套餐筛选；这里的来源必然是套餐或单次购买，
      // CHECK 保证其快照非空。
      return db.getAllAsync<RedemptionHistoryRow>(
        `SELECT
            u.id,
            u.purchase_item_id,
            u.purchase_item_name_snapshot AS item_name,
            e.occurred_on AS redeemed_on,
            e.institution_name_snapshot,
            e.city_name_snapshot AS city_snapshot,
            u.status,
            u.notes,
            u.person_name_snapshot,
            u.created_at,
            u.voided_at,
            u.void_reason
           FROM usage_records u
           JOIN purchase_items i ON i.id = u.purchase_item_id
           JOIN beauty_events e ON e.id = u.event_id
          WHERE i.purchase_id = ?
          ORDER BY e.occurred_on DESC, u.created_at DESC, u.id DESC`,
        [purchaseId],
      );
    },

    async listHistory(profileId, filter) {
      // 语句按状态从上面的常量表里取，`filter` 只是键，不进 SQL 文本。
      return db.getAllAsync<RedemptionHistoryEntryRow>(HISTORY_STATEMENTS[filter], [profileId]);
    },

    async findById(profileId, redemptionId) {
      // 归属经变美记录判断；项目用 LEFT JOIN，原套餐已删除的记录同样能读到。
      const row = await db.getFirstAsync<RedemptionContextRow>(
        `SELECT
            u.id,
            u.purchase_item_id,
            i.purchase_id AS purchase_id,
            e.occurred_on AS redeemed_on,
            u.status
           FROM usage_records u
           JOIN beauty_events e ON e.id = u.event_id
           LEFT JOIN purchase_items i ON i.id = u.purchase_item_id
          WHERE u.id = ? AND e.profile_id = ?
          LIMIT 1`,
        [redemptionId, profileId],
      );
      return row ?? null;
    },

    async voidById(profileId, redemptionId, voidedAt, voidReason) {
      // `status = 'void'` 内联而不是绑定：撤销只有这一个目标状态，
      // 做成参数等于允许调用方把记录改成任意状态。
      // `voided_at` 与 `updated_at` 共用同一个时间戳——它们描述的是同一个动作。
      // 只改这一行使用记录：变美记录与同一事件下的其他使用记录不动（PRD-EVT-007）。
      const result = await db.runAsync(
        `UPDATE usage_records
            SET status = 'void',
                voided_at = ?,
                void_reason = ?,
                updated_at = ?
          WHERE id = ?
            AND status = 'active'
            AND event_id IN (SELECT e.id FROM beauty_events e WHERE e.profile_id = ?)`,
        [voidedAt, voidReason, voidedAt, redemptionId, profileId],
      );
      return result.changes;
    },

    async insertEvent(row) {
      await db.runAsync(
        `INSERT INTO beauty_events
           (id, profile_id, occurred_on, institution_id, institution_name_snapshot,
            province_code_snapshot, province_name_snapshot, city_code_snapshot, city_name_snapshot,
            notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.profile_id,
          row.occurred_on,
          row.institution_id,
          row.institution_name_snapshot,
          row.province_code_snapshot,
          row.province_name_snapshot,
          row.city_code_snapshot,
          row.city_name_snapshot,
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertUsage(row) {
      await db.runAsync(
        `INSERT INTO usage_records
           (id, event_id, source_kind, purchase_item_id, person_id, person_name_snapshot,
            category_code_snapshot, service_code_snapshot, service_name_snapshot, custom_name_snapshot,
            purchase_name_snapshot, purchase_item_name_snapshot,
            status, voided_at, void_reason, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.event_id,
          row.source_kind,
          row.purchase_item_id,
          row.person_id,
          row.person_name_snapshot,
          row.category_code_snapshot,
          row.service_code_snapshot,
          row.service_name_snapshot,
          row.custom_name_snapshot,
          row.purchase_name_snapshot,
          row.purchase_item_name_snapshot,
          row.status,
          row.voided_at,
          row.void_reason,
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async countEventUsages(eventId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM usage_records WHERE event_id = ?`,
        [eventId],
      );
      return row?.count ?? 0;
    },

    async countEvents(profileId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM beauty_events WHERE profile_id = ?`,
        [profileId],
      );
      return row?.count ?? 0;
    },
  };
}
