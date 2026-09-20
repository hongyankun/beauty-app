import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CatalogFavoriteRow,
  InstitutionRow,
  ProfileRow,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  WishlistItemRow,
} from '../types';
import type { BackupRepository } from './types';

/**
 * 数据备份的 SQLite 实现：按档案把每张业务表整行读出来。
 *
 * 与其它 repository 不同，这里**不做任何派生与聚合**。备份要能原样还原，
 * 所以读的是列本身：剩余次数、累计金额这类派生值一旦写进备份，
 * 恢复时就会和重新算出来的数对不上（任务书第五节）。
 *
 * 每条语句都显式列出列名而不用 `SELECT *`：以后追加迁移新增列时，
 * `*` 会让新列悄悄混进备份（或在旧格式里缺失）而没有任何编译期提示，
 * 显式列名则会在 `BackupRepository` 的返回类型上暴露出来。
 *
 * 归属校验：`purchase_items` 与 `redemption_records` 没有 `profile_id` 列，
 * 它们的归属必须顺着 `redemption_records → purchase_items → purchases.profile_id`
 * 走 JOIN 验证，不能只靠上层先查出 ID 再拼接（任务书第六节）。
 *
 * 排序全部显式指定，且每个 ORDER BY 都以主键收尾。SQLite 对未指定顺序的查询
 * 不保证稳定返回，同一毫秒写入的两行在两次导出里可能换位，
 * 那会让「同一个库连续导出两次，业务数据完全一致」这条验收无法成立。
 */
export function createBackupRepository(db: SQLiteDatabase): BackupRepository {
  return {
    async findProfile(profileId) {
      return db.getFirstAsync<ProfileRow>(
        `SELECT id, display_name, is_default, created_at, updated_at
           FROM profiles
          WHERE id = ?`,
        [profileId],
      );
    },

    async listInstitutions(profileId) {
      return db.getAllAsync<InstitutionRow>(
        `SELECT id, profile_id, name, normalized_name, city, notes,
                is_archived, created_at, updated_at
           FROM institutions
          WHERE profile_id = ?
          ORDER BY created_at ASC, id ASC`,
        [profileId],
      );
    },

    async listPurchases(profileId) {
      return db.getAllAsync<PurchaseRow>(
        `SELECT id, profile_id, institution_id, institution_name_snapshot, city_snapshot,
                name, purchase_date, total_amount_minor, currency, expires_on, notes,
                created_at, updated_at
           FROM purchases
          WHERE profile_id = ?
          ORDER BY created_at ASC, id ASC`,
        [profileId],
      );
    },

    async listPurchaseItems(profileId) {
      // 先按所属套餐的顺序（与 listPurchases 完全一致），再按项目自身的稳定顺序，
      // 这样备份里项目是跟着套餐成组出现的，人翻 JSON 时也读得下去。
      return db.getAllAsync<PurchaseItemRow>(
        `SELECT i.id, i.purchase_id, i.name, i.category, i.quantity,
                i.unit_amount_minor, i.notes, i.created_at, i.updated_at
           FROM purchase_items i
           JOIN purchases p ON p.id = i.purchase_id
          WHERE p.profile_id = ?
          ORDER BY p.created_at ASC, p.id ASC, i.created_at ASC, i.id ASC`,
        [profileId],
      );
    },

    async listRedemptionRecords(profileId) {
      // 有效与已撤销都要导出：撤销记录是纠错审计的一部分，不是垃圾数据
      // （PRD 第 7.2 节、ADR-016），所以这里不按 status 过滤。
      return db.getAllAsync<RedemptionRecordRow>(
        `SELECT r.id, r.purchase_item_id, r.institution_id, r.institution_name_snapshot,
                r.city_snapshot, r.redeemed_on, r.status, r.notes,
                r.created_at, r.updated_at, r.voided_at, r.void_reason
           FROM redemption_records r
           JOIN purchase_items i ON i.id = r.purchase_item_id
           JOIN purchases p ON p.id = i.purchase_id
          WHERE p.profile_id = ?
          ORDER BY r.created_at ASC, r.id ASC`,
        [profileId],
      );
    },

    async listWishlistItems(profileId) {
      return db.getAllAsync<WishlistItemRow>(
        `SELECT id, profile_id, name, category, institution_id, planned_on,
                budget_minor, notes, created_at, updated_at
           FROM wishlist_items
          WHERE profile_id = ?
          ORDER BY created_at ASC, id ASC`,
        [profileId],
      );
    },

    async listCatalogFavorites(profileId) {
      // 只有三列，本来就没有正文可导：文章内容随 App 打包，不在数据库里
      // （PRD 第 11.1.1 节）。
      return db.getAllAsync<CatalogFavoriteRow>(
        `SELECT profile_id, article_slug, created_at
           FROM catalog_favorites
          WHERE profile_id = ?
          ORDER BY created_at ASC, article_slug ASC`,
        [profileId],
      );
    },
  };
}
