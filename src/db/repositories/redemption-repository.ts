import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  RedemptionContextRow,
  RedemptionHistoryEntryRow,
  RedemptionHistoryRow,
  RedemptionRepository,
  RedemptionStatusFilter,
} from './types';

/**
 * 完整核销历史的查询语句。
 *
 * 三条语句在模块加载时一次拼好，之后按 `RedemptionStatusFilter` 查表取用。
 * 两个原因：
 *
 * 1. 不把过滤条件写成 `(? = 'all' OR r.status = ?)`。那样虽然也是绑定参数，
 *    但 status 列上的条件变成了运行期表达式，`idx_redemptions_status_date`
 *    就用不上了。
 * 2. 参与拼接的只有本文件里的字面量，运行期没有任何值能进到 SQL 文本里。
 *    调用方传的 `filter` 只用作查表的键，不参与拼接。
 *
 * 两次 JOIN 既取出项目与套餐名称，也是这条查询唯一的档案归属校验点：
 * `redemption_records` 与 `purchase_items` 都没有 `profile_id`。
 *
 * 机构与城市取 `r.*_snapshot` 而不是 `p.*_snapshot`：历史要显示那一次核销
 * 当时的机构，套餐后来改机构不改写它（PRD-INST-005、PRD-PUR-018）。
 */
const HISTORY_SELECT = `SELECT
    r.id,
    r.purchase_item_id,
    i.name   AS item_name,
    p.id     AS purchase_id,
    p.name   AS purchase_name,
    r.redeemed_on,
    r.status,
    r.institution_name_snapshot,
    r.city_snapshot,
    r.notes,
    r.created_at,
    r.voided_at,
    r.void_reason
   FROM redemption_records r
   JOIN purchase_items i ON i.id = r.purchase_item_id
   JOIN purchases p ON p.id = i.purchase_id
  WHERE p.profile_id = ?`;

/** 稳定排序：核销日期倒序，同日按创建时间倒序，再同则按 ID 倒序（任务书第六节）。 */
const HISTORY_ORDER = `
  ORDER BY r.redeemed_on DESC, r.created_at DESC, r.id DESC`;

const HISTORY_STATEMENTS: Readonly<Record<RedemptionStatusFilter, string>> = {
  all: `${HISTORY_SELECT}${HISTORY_ORDER}`,
  active: `${HISTORY_SELECT} AND r.status = 'active'${HISTORY_ORDER}`,
  void: `${HISTORY_SELECT} AND r.status = 'void'${HISTORY_ORDER}`,
};

/**
 * 核销记录的 SQLite 实现。
 *
 * 所有运行期的值都走参数绑定，SQL 文本里不出现任何调用方传入的内容
 * （上面三条历史语句由本文件的字面量在模块加载时拼成，理由见其注释）。
 *
 * 这一层只负责「怎么读写核销这张表」，不判断余次够不够、不决定机构怎么继承——
 * 那些是业务规则，属于 service（ARCHITECTURE 第三节）。
 */
export function createRedemptionRepository(db: SQLiteDatabase): RedemptionRepository {
  return {
    async countActiveByItem(purchaseItemId) {
      // `status = 'active'` 是写死在 SQL 里的常量而不是绑定参数：余次的定义只有
      // 这一种，把它做成参数等于允许调用方按别的状态算余次。
      // 命中 idx_redemptions_item_status (purchase_item_id, status)。
      const row = await db.getFirstAsync<{ active_count: number }>(
        `SELECT COUNT(*) AS active_count
           FROM redemption_records
          WHERE purchase_item_id = ? AND status = 'active'`,
        [purchaseItemId],
      );
      return row?.active_count ?? 0;
    },

    async listByPurchase(purchaseId) {
      // 已作废的记录同样返回：它们要在历史里继续可见并标注（ADR-016），
      // 只是不参与余次计算。
      return db.getAllAsync<RedemptionHistoryRow>(
        `SELECT
            r.id,
            r.purchase_item_id,
            i.name AS item_name,
            r.redeemed_on,
            r.institution_name_snapshot,
            r.city_snapshot,
            r.status,
            r.notes,
            r.created_at,
            r.voided_at,
            r.void_reason
           FROM redemption_records r
           JOIN purchase_items i ON i.id = r.purchase_item_id
          WHERE i.purchase_id = ?
          ORDER BY r.redeemed_on DESC, r.created_at DESC`,
        [purchaseId],
      );
    },

    async listHistory(profileId, filter) {
      // 语句按状态从上面的常量表里取，`filter` 只是键，不进 SQL 文本。
      return db.getAllAsync<RedemptionHistoryEntryRow>(HISTORY_STATEMENTS[filter], [profileId]);
    },

    async findById(profileId, redemptionId) {
      // 两次 JOIN：`purchase_items` 给项目名称，`purchases` 给档案归属。
      // 少了后者这条查询就只是「按 ID 取一行」，任何档案的记录都能读到。
      const row = await db.getFirstAsync<RedemptionContextRow>(
        `SELECT
            r.id,
            r.purchase_item_id,
            i.name AS item_name,
            p.id   AS purchase_id,
            r.redeemed_on,
            r.status,
            r.institution_name_snapshot,
            r.city_snapshot
           FROM redemption_records r
           JOIN purchase_items i ON i.id = r.purchase_item_id
           JOIN purchases p ON p.id = i.purchase_id
          WHERE r.id = ? AND p.profile_id = ?
          LIMIT 1`,
        [redemptionId, profileId],
      );
      return row ?? null;
    },

    async voidById(redemptionId, voidedAt, voidReason) {
      // `status = 'void'` 内联而不是绑定：撤销只有这一个目标状态，
      // 做成参数等于允许调用方把记录改成任意状态。
      // `voided_at` 与 `updated_at` 共用同一个时间戳——它们描述的是同一个动作。
      const result = await db.runAsync(
        `UPDATE redemption_records
            SET status = 'void',
                voided_at = ?,
                void_reason = ?,
                updated_at = ?
          WHERE id = ? AND status = 'active'`,
        [voidedAt, voidReason, voidedAt, redemptionId],
      );
      return result.changes;
    },

    async insert(row) {
      await db.runAsync(
        `INSERT INTO redemption_records
           (id, purchase_item_id, institution_id, institution_name_snapshot, city_snapshot,
            redeemed_on, status, notes, created_at, updated_at, voided_at, void_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.purchase_item_id,
          row.institution_id,
          row.institution_name_snapshot,
          row.city_snapshot,
          row.redeemed_on,
          row.status,
          row.notes,
          row.created_at,
          row.updated_at,
          row.voided_at,
          row.void_reason,
        ],
      );
    },
  };
}
