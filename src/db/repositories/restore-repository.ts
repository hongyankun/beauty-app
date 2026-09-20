import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CatalogFavoriteRow,
  InstitutionRow,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  WishlistItemRow,
} from '../types';
import type { RestoreOrphanCountsRow, RestoreRepository, RestoreRowCountsRow } from './types';

/**
 * 从备份覆盖写回本地数据库的 SQLite 实现。
 *
 * 三条贯穿全文件的规矩：
 *
 * 1. **列名写死在源码里。** 每条 INSERT 都显式列出列名，值全部走参数绑定。
 *    备份文件是不可信输入，里面的任何字符串都只能作为**值**出现，
 *    绝不参与拼 SQL，也绝不被当成列名或表名（任务书第八、十五节）。
 *    因此文件里即便写着 `DROP TABLE`，它也只是一个套餐名字。
 *
 * 2. **原样写回。** 不生成 ID、不刷新 `updated_at`、不重算归一化名称。
 *    这里不能复用「新增套餐」「新增核销」那些 service：它们的职责恰恰是
 *    生成这些值，用它们恢复出来的库和备份对不上（任务书第三、八节）。
 *
 * 3. **自己保证引用完整性。** 独占事务跑在新连接上，`PRAGMA foreign_keys`
 *    不继承、且 BEGIN 之后再开是静默无效的（见 `run-in-transaction.ts`）。
 *    所以删除要按子表在前的顺序手工做，写完再用 `countOrphans` 数一遍。
 *    **绝不关闭外键检查**——那是把唯一还可能生效的保护也拆掉。
 */
export function createRestoreRepository(db: SQLiteDatabase): RestoreRepository {
  /** 逐行插入。批量拼 VALUES 能省几次往返，但会让参数个数随备份大小变化，得不偿失。 */
  const insertEach = async <T>(
    rows: readonly T[],
    sql: string,
    params: (row: T) => readonly (string | number | null)[],
  ): Promise<void> => {
    for (const row of rows) {
      const result = await db.runAsync(sql, params(row) as (string | number | null)[]);
      if (result.changes !== 1) {
        // INSERT 影响 0 行说明这一行被某个约束挡住了。继续插下去只会得到
        // 一个「大部分数据都在」的库，而缺的那几条没人知道。
        throw new Error('恢复时有一行没有写入');
      }
    }
  };

  return {
    async getSchemaVersion() {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      return row?.user_version ?? 0;
    },

    async deleteProfileData(profileId) {
      // 顺序是从叶子往根走。`redemption_records` 与 `purchase_items` 没有
      // `profile_id` 列，只能顺着外键往上找到带档案列的 `purchases`。
      await db.runAsync(`DELETE FROM catalog_favorites WHERE profile_id = ?`, [profileId]);
      await db.runAsync(`DELETE FROM wishlist_items WHERE profile_id = ?`, [profileId]);
      await db.runAsync(
        `DELETE FROM redemption_records
          WHERE purchase_item_id IN (
                SELECT i.id FROM purchase_items i
                  JOIN purchases p ON p.id = i.purchase_id
                 WHERE p.profile_id = ?)`,
        [profileId],
      );
      await db.runAsync(
        `DELETE FROM purchase_items
          WHERE purchase_id IN (SELECT id FROM purchases WHERE profile_id = ?)`,
        [profileId],
      );
      await db.runAsync(`DELETE FROM purchases WHERE profile_id = ?`, [profileId]);
      await db.runAsync(`DELETE FROM institutions WHERE profile_id = ?`, [profileId]);
    },

    async upsertProfile(row) {
      // 档案行用 UPSERT 而不是「先删再插」：删掉档案会连带级联掉一切，
      // 而且删除与插入之间那一瞬间，库里一个可用档案都没有。
      const result = await db.runAsync(
        `INSERT INTO profiles (id, display_name, is_default, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                is_default   = excluded.is_default,
                created_at   = excluded.created_at,
                updated_at   = excluded.updated_at`,
        [row.id, row.display_name, row.is_default, row.created_at, row.updated_at],
      );
      if (result.changes !== 1) {
        throw new Error('恢复时档案没有写入');
      }
    },

    async insertInstitutions(rows) {
      await insertEach(
        rows,
        `INSERT INTO institutions
                (id, profile_id, name, normalized_name, city, notes,
                 is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: InstitutionRow) => [
          row.id,
          row.profile_id,
          row.name,
          row.normalized_name,
          row.city,
          row.notes,
          row.is_archived,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertPurchases(rows) {
      await insertEach(
        rows,
        `INSERT INTO purchases
                (id, profile_id, institution_id, institution_name_snapshot, city_snapshot,
                 name, purchase_date, total_amount_minor, currency, expires_on, notes,
                 created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: PurchaseRow) => [
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

    async insertPurchaseItems(rows) {
      await insertEach(
        rows,
        `INSERT INTO purchase_items
                (id, purchase_id, name, category, quantity, unit_amount_minor, notes,
                 created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: PurchaseItemRow) => [
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
    },

    async insertRedemptionRecords(rows) {
      // 有效与已撤销一起写回，`voided_at` 与 `void_reason` 原样保留：
      // 撤销记录是审计的一部分，恢复时把它们抹成有效等于凭空多出几次核销
      // （PRD 第 7.2 节、ADR-016）。
      await insertEach(
        rows,
        `INSERT INTO redemption_records
                (id, purchase_item_id, institution_id, institution_name_snapshot, city_snapshot,
                 redeemed_on, status, notes, created_at, updated_at, voided_at, void_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: RedemptionRecordRow) => [
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

    async insertWishlistItems(rows) {
      await insertEach(
        rows,
        `INSERT INTO wishlist_items
                (id, profile_id, name, category, institution_id, planned_on,
                 budget_minor, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: WishlistItemRow) => [
          row.id,
          row.profile_id,
          row.name,
          row.category,
          row.institution_id,
          row.planned_on,
          row.budget_minor,
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertCatalogFavorites(rows) {
      await insertEach(
        rows,
        `INSERT INTO catalog_favorites (profile_id, article_slug, created_at)
              VALUES (?, ?, ?)`,
        (row: CatalogFavoriteRow) => [row.profile_id, row.article_slug, row.created_at],
      );
    },

    async countAllRows() {
      const row = await db.getFirstAsync<RestoreRowCountsRow>(
        `SELECT (SELECT COUNT(*) FROM profiles)           AS profiles,
                (SELECT COUNT(*) FROM institutions)       AS institutions,
                (SELECT COUNT(*) FROM purchases)          AS purchases,
                (SELECT COUNT(*) FROM purchase_items)     AS purchase_items,
                (SELECT COUNT(*) FROM redemption_records) AS redemption_records,
                (SELECT COUNT(*) FROM wishlist_items)     AS wishlist_items,
                (SELECT COUNT(*) FROM catalog_favorites)  AS catalog_favorites`,
      );
      if (row === null) {
        throw new Error('恢复自检没能读到行数');
      }
      return row;
    },

    async countOrphans(profileId) {
      const row = await db.getFirstAsync<RestoreOrphanCountsRow>(
        `SELECT
           (SELECT COUNT(*) FROM purchase_items i
             WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = i.purchase_id))
             AS orphan_purchase_items,
           (SELECT COUNT(*) FROM redemption_records r
             WHERE NOT EXISTS (SELECT 1 FROM purchase_items i WHERE i.id = r.purchase_item_id))
             AS orphan_redemption_records,
           (SELECT COUNT(*) FROM purchases p
             WHERE p.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = p.institution_id))
             AS dangling_purchase_institutions,
           (SELECT COUNT(*) FROM redemption_records r
             WHERE r.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = r.institution_id))
             AS dangling_redemption_institutions,
           (SELECT COUNT(*) FROM wishlist_items w
             WHERE w.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = w.institution_id))
             AS dangling_wishlist_institutions,
           (SELECT (SELECT COUNT(*) FROM institutions      WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM purchases         WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM wishlist_items    WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM catalog_favorites WHERE profile_id <> ?))
             AS foreign_profile_rows`,
        [profileId, profileId, profileId, profileId],
      );
      if (row === null) {
        throw new Error('恢复自检没能读到引用计数');
      }
      return row;
    },
  };
}
