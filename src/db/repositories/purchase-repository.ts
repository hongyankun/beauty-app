import type { SQLiteDatabase } from 'expo-sqlite';

import type { PurchaseRow } from '../types';
import type {
  PurchaseDeletionImpactRow,
  PurchaseItemContextRow,
  PurchaseItemDetailRow,
  PurchaseRepository,
  PurchaseSummaryRow,
  RedeemableItemRow,
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

    async listRedeemableItems(profileId) {
      // 「还有余次」= 购买次数 > 有效核销数。判断写在 SQL 里，但两个数各自
      // 独立返回，上层仍然自己派生 remaining——库里没有也不会有 remaining 列。
      //
      // 核销数用一个预聚合子查询 LEFT JOIN 进来，而不是相关子查询：这条语句
      // 要对全档案的项目做过滤与排序，预聚合只扫一遍 redemption_records
      // （命中 idx_redemptions_item_status），相关子查询则是每个项目扫一次。
      // 从未核销过的项目在子查询里没有对应行，COALESCE 兜成 0。
      //
      // 排序（任务书第五节）：有有效期的排在前面、越早越靠前；没有有效期的
      // 统一排在后面；同有效期按套餐购买日期倒序；最后按项目录入顺序。
      // rowid 兜底的理由同 listItemDetails——同批项目 created_at 完全相同。
      return db.getAllAsync<RedeemableItemRow>(
        `SELECT
            i.id,
            i.name,
            i.quantity,
            COALESCE(rc.active_count, 0) AS active_redemption_count,
            p.id   AS purchase_id,
            p.name AS purchase_name,
            p.institution_name_snapshot,
            p.city_snapshot,
            p.expires_on
           FROM purchase_items i
           JOIN purchases p ON p.id = i.purchase_id
           LEFT JOIN (
             SELECT purchase_item_id, COUNT(*) AS active_count
               FROM redemption_records
              WHERE status = 'active'
              GROUP BY purchase_item_id
           ) rc ON rc.purchase_item_id = i.id
          WHERE p.profile_id = ? AND i.quantity > COALESCE(rc.active_count, 0)
          ORDER BY (p.expires_on IS NULL) ASC,
                   p.expires_on ASC,
                   p.purchase_date DESC,
                   i.created_at ASC,
                   i.rowid ASC`,
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

    async getDeletionImpact(purchaseId) {
      // 两个子查询各算各的，理由同 `listSummaries`：JOIN 在一起会让项目数
      // 被核销记录数放大。核销数**不过滤 status**——已撤销的记录同样会被删除。
      const row = await db.getFirstAsync<PurchaseDeletionImpactRow>(
        `SELECT
            (SELECT COUNT(*)
               FROM purchase_items i
              WHERE i.purchase_id = ?) AS item_count,
            (SELECT COUNT(*)
               FROM redemption_records r
               JOIN purchase_items i ON i.id = r.purchase_item_id
              WHERE i.purchase_id = ?) AS redemption_count`,
        [purchaseId, purchaseId],
      );
      return row ?? { item_count: 0, redemption_count: 0 };
    },

    async deletePermanently(profileId, purchaseId) {
      // 子表**显式**按依赖顺序删除，不依赖 ON DELETE CASCADE。
      //
      // 原因见 run-in-transaction.ts：原生平台的独占事务跑在一条新连接上，
      // 那条连接没有执行过 `PRAGMA foreign_keys = ON`（SQLite 默认关闭），
      // 而进入 BEGIN 之后再设置该 PRAGMA 是静默无效的。此时删除套餐主记录
      // 不会触发任何级联，会留下一堆读不到、也删不掉的孤儿项目与核销记录。
      // 表上的 CASCADE 保留为声明式兜底：子行已经删空，级联再跑一次也是空操作。
      await db.runAsync(
        `DELETE FROM redemption_records
          WHERE purchase_item_id IN (
            SELECT i.id FROM purchase_items i WHERE i.purchase_id = ?
          )`,
        [purchaseId],
      );
      await db.runAsync(`DELETE FROM purchase_items WHERE purchase_id = ?`, [purchaseId]);

      // 主记录带档案条件删除。它同时是这一组语句的守门人：档案不匹配时
      // 这一句删不到行，调用方看到 0 会整体回滚，上面两句一并撤销。
      const result = await db.runAsync(`DELETE FROM purchases WHERE id = ? AND profile_id = ?`, [
        purchaseId,
        profileId,
      ]);
      return result.changes;
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
