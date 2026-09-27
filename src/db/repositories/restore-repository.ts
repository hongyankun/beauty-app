import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  BeautyEventRow,
  CatalogFavoriteRow,
  InstitutionRow,
  PersonRow,
  PurchaseItemRow,
  PurchaseRow,
  UsageRecordRow,
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
 *    这里不能复用「新增套餐」「记录核销」那些 service：它们的职责恰恰是
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
      // 顺序是从叶子往根走（DATA_MODEL_V4 第 11.5 节）。`usage_records` 与
      // `purchase_items` 没有 `profile_id` 列：前者经变美记录、后者经套餐找到档案。
      //
      // 使用记录刻意按**两条路径**删：属于本档案事件的，以及引用本档案套餐项目的。
      // 后者正常情况下是前者的子集；万一库里已经存在跨档案引用，只删前者会在
      // 删掉项目之后留下指向空处的使用记录，随后的自检会把它当成恢复失败。
      await db.runAsync(`DELETE FROM catalog_favorites WHERE profile_id = ?`, [profileId]);
      await db.runAsync(`DELETE FROM wishlist_items WHERE profile_id = ?`, [profileId]);
      await db.runAsync(
        `DELETE FROM usage_records
          WHERE event_id IN (SELECT e.id FROM beauty_events e WHERE e.profile_id = ?)
             OR purchase_item_id IN (
                SELECT i.id FROM purchase_items i
                  JOIN purchases p ON p.id = i.purchase_id
                 WHERE p.profile_id = ?)`,
        [profileId, profileId],
      );
      await db.runAsync(`DELETE FROM beauty_events WHERE profile_id = ?`, [profileId]);
      await db.runAsync(
        `DELETE FROM purchase_items
          WHERE purchase_id IN (SELECT id FROM purchases WHERE profile_id = ?)`,
        [profileId],
      );
      await db.runAsync(`DELETE FROM purchases WHERE profile_id = ?`, [profileId]);
      await db.runAsync(`DELETE FROM people WHERE profile_id = ?`, [profileId]);
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

    async insertPeople(rows) {
      await insertEach(
        rows,
        `INSERT INTO people
                (id, profile_id, display_name, normalized_name, is_self, status,
                 created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: PersonRow) => [
          row.id,
          row.profile_id,
          row.display_name,
          row.normalized_name,
          row.is_self,
          row.status,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertInstitutions(rows) {
      await insertEach(
        rows,
        `INSERT INTO institutions
                (id, profile_id, name, normalized_name, city, notes,
                 is_archived, created_at, updated_at,
                 province_code, province_name, city_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          row.province_code,
          row.province_name,
          row.city_code,
        ],
      );
    },

    async insertPurchases(rows) {
      await insertEach(
        rows,
        `INSERT INTO purchases
                (id, profile_id, purchase_kind, purchaser_person_id, purchaser_name_snapshot,
                 institution_id, institution_name_snapshot, city_snapshot,
                 name, purchase_date, total_amount_minor, currency, expires_on, notes,
                 created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: PurchaseRow) => [
          row.id,
          row.profile_id,
          row.purchase_kind,
          row.purchaser_person_id,
          row.purchaser_name_snapshot,
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
                (id, purchase_id, name, category_code, service_code, custom_name,
                 quantity, allocated_amount_minor, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: PurchaseItemRow) => [
          row.id,
          row.purchase_id,
          row.name,
          row.category_code,
          row.service_code,
          row.custom_name,
          row.quantity,
          row.allocated_amount_minor,
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
    },

    async insertBeautyEvents(rows) {
      await insertEach(
        rows,
        `INSERT INTO beauty_events
                (id, profile_id, occurred_on, institution_id, institution_name_snapshot,
                 province_code_snapshot, province_name_snapshot, city_code_snapshot,
                 city_name_snapshot, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: BeautyEventRow) => [
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

    async insertUsageRecords(rows) {
      // 有效与已撤销一起写回，`voided_at` 与 `void_reason` 原样保留：
      // 撤销记录是审计的一部分，恢复时把它们抹成有效等于凭空多出几次使用
      // （PRD 第 7.2 节、ADR-016）。
      await insertEach(
        rows,
        `INSERT INTO usage_records
                (id, event_id, source_kind, purchase_item_id, person_id, person_name_snapshot,
                 category_code_snapshot, service_code_snapshot, service_name_snapshot,
                 custom_name_snapshot, purchase_name_snapshot, purchase_item_name_snapshot,
                 status, voided_at, void_reason, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        (row: UsageRecordRow) => [
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
        `SELECT (SELECT COUNT(*) FROM profiles)          AS profiles,
                (SELECT COUNT(*) FROM people)            AS people,
                (SELECT COUNT(*) FROM institutions)      AS institutions,
                (SELECT COUNT(*) FROM purchases)         AS purchases,
                (SELECT COUNT(*) FROM purchase_items)    AS purchase_items,
                (SELECT COUNT(*) FROM beauty_events)     AS beauty_events,
                (SELECT COUNT(*) FROM usage_records)     AS usage_records,
                (SELECT COUNT(*) FROM wishlist_items)    AS wishlist_items,
                (SELECT COUNT(*) FROM catalog_favorites) AS catalog_favorites`,
      );
      if (row === null) {
        throw new Error('恢复自检没能读到行数');
      }
      return row;
    },

    async countOrphans(profileId) {
      // 除了「引用是否指向存在的行」，还要查「引用是否跨档案」：
      // 使用记录的事件、使用人与来源套餐必须属于同一个档案（DATA_MODEL_V4 第 11.5 节）。
      // 跨档案的使用记录计入 foreign_profile_rows。
      const row = await db.getFirstAsync<RestoreOrphanCountsRow>(
        `SELECT
           (SELECT COUNT(*) FROM purchase_items i
             WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id = i.purchase_id))
             AS orphan_purchase_items,
           (SELECT COUNT(*) FROM usage_records u
             WHERE NOT EXISTS (SELECT 1 FROM beauty_events e WHERE e.id = u.event_id))
             AS orphan_usage_records,
           (SELECT COUNT(*) FROM usage_records u
             WHERE u.purchase_item_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM purchase_items i WHERE i.id = u.purchase_item_id))
             AS dangling_usage_items,
           (SELECT COUNT(*) FROM usage_records u
             WHERE NOT EXISTS (SELECT 1 FROM people pe WHERE pe.id = u.person_id))
             AS dangling_usage_people,
           (SELECT COUNT(*) FROM purchases p
             WHERE NOT EXISTS (SELECT 1 FROM people pe WHERE pe.id = p.purchaser_person_id))
             AS dangling_purchasers,
           (SELECT COUNT(*) FROM purchases p
             WHERE p.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = p.institution_id))
             AS dangling_purchase_institutions,
           (SELECT COUNT(*) FROM beauty_events e
             WHERE e.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = e.institution_id))
             AS dangling_event_institutions,
           (SELECT COUNT(*) FROM wishlist_items w
             WHERE w.institution_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM institutions n WHERE n.id = w.institution_id))
             AS dangling_wishlist_institutions,
           (SELECT COUNT(*) FROM usage_records u
              JOIN purchase_items i ON i.id = u.purchase_item_id
              JOIN purchases p ON p.id = i.purchase_id
             WHERE (u.source_kind = 'package_item' AND p.purchase_kind <> 'package')
                OR (u.source_kind = 'single_purchase' AND p.purchase_kind <> 'single'))
             AS mismatched_usage_sources,
           (SELECT COUNT(*) FROM people WHERE profile_id = ? AND is_self = 1)
             AS self_count,
           (SELECT (SELECT COUNT(*) FROM people            WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM institutions      WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM purchases         WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM beauty_events     WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM wishlist_items    WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM catalog_favorites WHERE profile_id <> ?)
                 + (SELECT COUNT(*) FROM usage_records u
                      JOIN beauty_events e ON e.id = u.event_id
                      JOIN people pe ON pe.id = u.person_id
                     WHERE pe.profile_id <> e.profile_id)
                 + (SELECT COUNT(*) FROM usage_records u
                      JOIN beauty_events e ON e.id = u.event_id
                      JOIN purchase_items i ON i.id = u.purchase_item_id
                      JOIN purchases p ON p.id = i.purchase_id
                     WHERE p.profile_id <> e.profile_id)
                 + (SELECT COUNT(*) FROM purchases p
                      JOIN people pe ON pe.id = p.purchaser_person_id
                     WHERE pe.profile_id <> p.profile_id))
             AS foreign_profile_rows`,
        [profileId, profileId, profileId, profileId, profileId, profileId, profileId],
      );
      if (row === null) {
        throw new Error('恢复自检没能读到引用计数');
      }
      return row;
    },
  };
}
