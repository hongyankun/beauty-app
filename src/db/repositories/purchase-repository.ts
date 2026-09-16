import type { SQLiteDatabase } from 'expo-sqlite';

import type { PurchaseRepository, PurchaseSummaryRow } from './types';

/**
 * 套餐与套餐项目的 SQLite 实现。全部语句参数化绑定。
 *
 * 列表查询用三个相关子查询做聚合，而不是多表 JOIN 后 GROUP BY：
 * 项目与核销是两条独立的一对多路径，JOIN 在一起会产生笛卡尔积，
 * `COUNT(items)` 会被核销记录数放大。子查询各算各的，不会串味，
 * 并且分别命中 `idx_purchase_items_purchase` 与 `idx_redemptions_item_status`。
 */
export function createPurchaseRepository(db: SQLiteDatabase): PurchaseRepository {
  return {
    async listSummaries(profileId) {
      return db.getAllAsync<PurchaseSummaryRow>(
        `SELECT
            p.id,
            p.name,
            p.institution_name_snapshot,
            p.city_snapshot,
            p.purchase_date,
            p.total_amount_minor,
            p.currency,
            p.expires_on,
            p.created_at,
            (SELECT COUNT(*)
               FROM purchase_items i
              WHERE i.purchase_id = p.id) AS item_count,
            (SELECT COALESCE(SUM(i.quantity), 0)
               FROM purchase_items i
              WHERE i.purchase_id = p.id) AS total_quantity,
            (SELECT COUNT(*)
               FROM redemption_records r
               JOIN purchase_items ri ON ri.id = r.purchase_item_id
              WHERE ri.purchase_id = p.id AND r.status = 'active') AS active_redemption_count
           FROM purchases p
          WHERE p.profile_id = ?
          ORDER BY p.purchase_date DESC, p.created_at DESC`,
        [profileId],
      );
    },

    async insert(row) {
      await db.runAsync(
        `INSERT INTO purchases
           (id, profile_id, institution_id, institution_name_snapshot, city_snapshot,
            name, purchase_date, total_amount_minor, currency, expires_on, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.profile_id,
          row.institution_id,
          row.institution_name_snapshot,
          row.city_snapshot,
          row.name,
          row.purchase_date,
          row.total_amount_minor,
          row.currency,
          row.expires_on,
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertItems(rows) {
      // 逐条插入。调用方保证整批处在同一个事务里，任一条失败会连同套餐一起回滚，
      // 不会留下「只有一半项目」的套餐。
      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO purchase_items
             (id, purchase_id, name, category, quantity, unit_amount_minor, notes,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.purchase_id,
            row.name,
            row.category,
            row.quantity,
            row.unit_amount_minor,
            row.notes,
            row.created_at,
            row.updated_at,
          ],
        );
      }
    },
  };
}
