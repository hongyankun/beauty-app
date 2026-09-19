import type { SQLiteDatabase } from 'expo-sqlite';

import type { WishlistItemListRow, WishlistRepository } from './types';

/**
 * 心愿单的 SQLite 实现。
 *
 * 全部语句使用 `?` 绑定参数，不做任何字符串拼接（ARCHITECTURE 第三节）。
 * 每条语句的 WHERE 都带 `profile_id`：跨档案的读写连语句层面都不成立。
 */

/**
 * 心愿主数据 + 关联机构的**当前**名称与归档状态。
 *
 * 用 LEFT JOIN 而不是快照列：心愿指向的是「现在还想去的那家机构」，
 * 机构改名后卡片应当显示新名字（PRD 第 11 章）。购买与核销正相反，
 * 它们记录的是发生当时的事实，因此存快照——两套口径不可互换。
 *
 * LEFT JOIN 保证没填机构的心愿照常返回，此时两列为 NULL。
 */
const LIST_COLUMNS = `w.id, w.name, w.category, w.institution_id,
          i.name AS institution_name,
          i.is_archived AS institution_is_archived,
          w.planned_on, w.budget_minor, w.notes, w.created_at, w.updated_at`;

const LIST_FROM = `FROM wishlist_items w
          LEFT JOIN institutions i ON i.id = w.institution_id`;

export function createWishlistRepository(db: SQLiteDatabase): WishlistRepository {
  return {
    async listByProfile(profileId) {
      // 第三个排序列是稳定性保险：同一毫秒写入的两条心愿若只比前两列，
      // 返回顺序由 SQLite 自行决定，两次查询可能不一致。
      return db.getAllAsync<WishlistItemListRow>(
        `SELECT ${LIST_COLUMNS}
           ${LIST_FROM}
          WHERE w.profile_id = ?
          ORDER BY w.updated_at DESC, w.created_at DESC, w.id DESC`,
        [profileId],
      );
    },

    async findById(profileId, wishlistItemId) {
      const row = await db.getFirstAsync<WishlistItemListRow>(
        `SELECT ${LIST_COLUMNS}
           ${LIST_FROM}
          WHERE w.profile_id = ? AND w.id = ?
          LIMIT 1`,
        [profileId, wishlistItemId],
      );
      return row ?? null;
    },

    async insert(row) {
      await db.runAsync(
        `INSERT INTO wishlist_items
           (id, profile_id, name, category, institution_id, planned_on, budget_minor,
            notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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

    async update(row) {
      // 不写 profile_id 与 created_at：归属与创建时间不随编辑改变。
      const result = await db.runAsync(
        `UPDATE wishlist_items
            SET name = ?, category = ?, institution_id = ?, planned_on = ?,
                budget_minor = ?, notes = ?, updated_at = ?
          WHERE id = ? AND profile_id = ?`,
        [
          row.name,
          row.category,
          row.institution_id,
          row.planned_on,
          row.budget_minor,
          row.notes,
          row.updated_at,
          row.id,
          row.profile_id,
        ],
      );
      return result.changes;
    },

    async deletePermanently(profileId, wishlistItemId) {
      // 心愿没有软删除、没有回收站：确认后就是真正的 DELETE。
      // 这条记录不被任何其他表引用，删除不会波及机构、套餐与核销。
      const result = await db.runAsync(
        `DELETE FROM wishlist_items WHERE id = ? AND profile_id = ?`,
        [wishlistItemId, profileId],
      );
      return result.changes;
    },
  };
}
