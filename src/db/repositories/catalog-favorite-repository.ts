import type { SQLiteDatabase } from 'expo-sqlite';

import type { CatalogFavoriteListRow, CatalogFavoriteRepository } from './types';

/**
 * 百科收藏的 SQLite 实现。
 *
 * 全部语句使用 `?` 绑定参数，不做任何字符串拼接（ARCHITECTURE 第三节）。
 * 每条语句的 WHERE 都带 `profile_id`：跨档案的读写连语句层面都不成立。
 *
 * 这里只认 slug，不认文章内容：标题、摘要与分类由 service 回本地内容里取，
 * 数据库不保存任何会随内容更新而过时的文本（任务书第 4.1 节）。
 */
export function createCatalogFavoriteRepository(db: SQLiteDatabase): CatalogFavoriteRepository {
  return {
    async listByProfile(profileId) {
      return db.getAllAsync<CatalogFavoriteListRow>(
        `SELECT article_slug, created_at
           FROM catalog_favorites
          WHERE profile_id = ?
          ORDER BY created_at DESC, article_slug DESC`,
        [profileId],
      );
    },

    async exists(profileId, articleSlug) {
      // 只取 1 是因为存在性不需要整行；命中的是复合主键索引。
      const row = await db.getFirstAsync<{ readonly one: number }>(
        `SELECT 1 AS one
           FROM catalog_favorites
          WHERE profile_id = ? AND article_slug = ?
          LIMIT 1`,
        [profileId, articleSlug],
      );
      return row !== null;
    },

    async insert(row) {
      await db.runAsync(
        `INSERT INTO catalog_favorites (profile_id, article_slug, created_at)
         VALUES (?, ?, ?)`,
        [row.profile_id, row.article_slug, row.created_at],
      );
    },

    async delete(profileId, articleSlug) {
      // 取消收藏就是真正的 DELETE：收藏不是业务记录，没有作废与审计的必要，
      // 也不被任何表引用，删除只影响自己那一行。
      const result = await db.runAsync(
        `DELETE FROM catalog_favorites WHERE profile_id = ? AND article_slug = ?`,
        [profileId, articleSlug],
      );
      return result.changes;
    },
  };
}
