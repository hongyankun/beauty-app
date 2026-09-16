import type { SQLiteDatabase } from 'expo-sqlite';

import type { PurchaseRow } from '../types';
import type {
  PurchaseItemContextRow,
  PurchaseItemDetailRow,
  PurchaseRepository,
  PurchaseSummaryRow,
} from './types';

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

    async findById(profileId, purchaseId) {
      const row = await db.getFirstAsync<PurchaseRow>(
        `SELECT id, profile_id, institution_id, institution_name_snapshot, city_snapshot,
                name, purchase_date, total_amount_minor, currency, expires_on, notes,
                created_at, updated_at
           FROM purchases
          WHERE profile_id = ? AND id = ?
          LIMIT 1`,
        [profileId, purchaseId],
      );
      return row ?? null;
    },

    async listItemDetails(purchaseId) {
      // 项目按录入顺序排列（任务书第六节：created_at 升序）。同一个套餐的项目是
      // 在一个事务里用同一个时间戳批量插入的，created_at 完全相同，单靠它排序
      // 顺序不稳定，因此再用隐式 rowid 兜底——rowid 就是插入顺序。
      return db.getAllAsync<PurchaseItemDetailRow>(
        `SELECT
            i.id,
            i.name,
            i.category,
            i.quantity,
            i.unit_amount_minor,
            i.notes,
            i.created_at,
            (SELECT COUNT(*)
               FROM redemption_records r
              WHERE r.purchase_item_id = i.id AND r.status = 'active') AS active_redemption_count
           FROM purchase_items i
          WHERE i.purchase_id = ?
          ORDER BY i.created_at ASC, i.rowid ASC`,
        [purchaseId],
      );
    },

    async findItemContext(profileId, purchaseItemId) {
      // JOIN 套餐既是为了拿有效期与机构快照，也是这条查询唯一的档案归属校验点：
      // purchase_items 自己没有 profile_id。
      const row = await db.getFirstAsync<PurchaseItemContextRow>(
        `SELECT
            i.id,
            i.name,
            i.quantity,
            p.id   AS purchase_id,
            p.name AS purchase_name,
            p.purchase_date,
            p.expires_on,
            p.institution_id,
            p.institution_name_snapshot,
            p.city_snapshot
           FROM purchase_items i
           JOIN purchases p ON p.id = i.purchase_id
          WHERE i.id = ? AND p.profile_id = ?
          LIMIT 1`,
        [purchaseItemId, profileId],
      );
      return row ?? null;
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
