import type { SQLiteDatabase } from 'expo-sqlite';

import type { InstitutionRow } from '../types';
import type { InstitutionOption, InstitutionRepository } from './types';

/**
 * 机构的 SQLite 实现。
 *
 * 全部语句使用 `?` 绑定参数，不做任何字符串拼接（ARCHITECTURE 第三节）。
 * 列名逐条写出而不是 `SELECT *`：加列时查询结果类型不会悄悄漂移。
 */
export function createInstitutionRepository(db: SQLiteDatabase): InstitutionRepository {
  return {
    async listSelectable(profileId) {
      return db.getAllAsync<InstitutionOption>(
        `SELECT id, name, city
           FROM institutions
          WHERE profile_id = ? AND is_archived = 0
          ORDER BY name COLLATE NOCASE ASC`,
        [profileId],
      );
    },

    async findByNormalizedName(profileId, normalizedName) {
      // 归档的机构不参与复用：用户把它归档就是不想再选到它，
      // 此时应当新建一条，而不是把记录挂回已归档的机构上。
      const row = await db.getFirstAsync<InstitutionRow>(
        `SELECT id, profile_id, name, normalized_name, city, notes, is_archived, created_at, updated_at
           FROM institutions
          WHERE profile_id = ? AND normalized_name = ? AND is_archived = 0
          ORDER BY created_at ASC
          LIMIT 1`,
        [profileId, normalizedName],
      );
      return row ?? null;
    },

    async findById(profileId, institutionId) {
      const row = await db.getFirstAsync<InstitutionRow>(
        `SELECT id, profile_id, name, normalized_name, city, notes, is_archived, created_at, updated_at
           FROM institutions
          WHERE profile_id = ? AND id = ?
          LIMIT 1`,
        [profileId, institutionId],
      );
      return row ?? null;
    },

    async insert(row) {
      await db.runAsync(
        `INSERT INTO institutions
           (id, profile_id, name, normalized_name, city, notes, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
  };
}
