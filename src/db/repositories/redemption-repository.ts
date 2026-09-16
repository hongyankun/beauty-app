import type { SQLiteDatabase } from 'expo-sqlite';

import type { RedemptionHistoryRow, RedemptionRepository } from './types';

/**
 * 核销记录的 SQLite 实现。全部语句参数化绑定，不做任何字符串拼接。
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
            r.created_at
           FROM redemption_records r
           JOIN purchase_items i ON i.id = r.purchase_item_id
          WHERE i.purchase_id = ?
          ORDER BY r.redeemed_on DESC, r.created_at DESC`,
        [purchaseId],
      );
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
