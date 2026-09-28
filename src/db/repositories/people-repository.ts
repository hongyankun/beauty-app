import type { SQLiteDatabase } from 'expo-sqlite';

import type { PersonRow } from '../types';
import type { PeopleRepository, PersonConflictRow, PersonOption, PersonUsageRow } from './types';

/**
 * 使用人的 SQLite 实现。
 *
 * 全部语句使用 `?` 绑定参数，不做任何字符串拼接（ARCHITECTURE 第三节）。
 * 「自己」的保护写在每一条写语句的条件里（`is_self = 0`），不只靠 service 先判断。
 */

const PERSON_COLUMNS =
  'id, profile_id, display_name, normalized_name, is_self, status, created_at, updated_at';

/**
 * 人员主数据 + 两个引用计数。
 *
 * 与机构一样用相关子查询而不是 JOIN + GROUP BY，两个计数互不放大。
 * 使用记录不按 status 过滤：已撤销的记录同样引用着这个人。
 */
const USAGE_COLUMNS = `p.id, p.display_name, p.is_self, p.status, p.created_at, p.updated_at,
          (SELECT COUNT(*) FROM purchases pu WHERE pu.purchaser_person_id = p.id) AS purchase_count,
          (SELECT COUNT(*) FROM usage_records u WHERE u.person_id = p.id) AS usage_count`;

export function createPeopleRepository(db: SQLiteDatabase): PeopleRepository {
  return {
    async findSelf(profileId) {
      // 按 `(profile_id, is_self = 1)` 查找，命中唯一部分索引 idx_people_single_self；
      // 不依赖固定 ID（DATA_MODEL_V4 第 4.2 节）。
      const row = await db.getFirstAsync<PersonRow>(
        `SELECT ${PERSON_COLUMNS}
           FROM people
          WHERE profile_id = ? AND is_self = 1
          LIMIT 1`,
        [profileId],
      );
      return row ?? null;
    },

    async findById(profileId, personId) {
      const row = await db.getFirstAsync<PersonRow>(
        `SELECT ${PERSON_COLUMNS}
           FROM people
          WHERE profile_id = ? AND id = ?
          LIMIT 1`,
        [profileId, personId],
      );
      return row ?? null;
    },

    async listWithUsage(profileId, status) {
      return db.getAllAsync<PersonUsageRow>(
        `SELECT ${USAGE_COLUMNS}
           FROM people p
          WHERE p.profile_id = ? AND p.status = ?
          ORDER BY p.is_self DESC, p.updated_at DESC, p.created_at DESC, p.id ASC`,
        [profileId, status],
      );
    },

    async findDetailById(profileId, personId) {
      const row = await db.getFirstAsync<PersonUsageRow>(
        `SELECT ${USAGE_COLUMNS}
           FROM people p
          WHERE p.profile_id = ? AND p.id = ?
          LIMIT 1`,
        [profileId, personId],
      );
      return row ?? null;
    },

    async listSelectable(profileId) {
      return db.getAllAsync<PersonOption>(
        `SELECT id, display_name, is_self
           FROM people
          WHERE profile_id = ? AND status = 'active'
          ORDER BY is_self DESC, display_name COLLATE NOCASE ASC, id ASC`,
        [profileId],
      );
    },

    async findConflict(profileId, normalizedName, excludeId) {
      // 已归档的人同样占用这个名字：归档只是不再出现在选择器里。
      const row = await db.getFirstAsync<PersonConflictRow>(
        `SELECT id, display_name, is_self, status
           FROM people
          WHERE profile_id = ? AND normalized_name = ? AND id <> ?
          LIMIT 1`,
        [profileId, normalizedName, excludeId ?? ''],
      );
      return row ?? null;
    },

    async insertOther(row) {
      await db.runAsync(
        `INSERT INTO people
           (id, profile_id, display_name, normalized_name, is_self, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'active', ?, ?)`,
        [row.id, row.profile_id, row.display_name, row.normalized_name, row.created_at, row.created_at],
      );
    },

    async updateName(profileId, personId, displayName, normalizedName, updatedAt) {
      const result = await db.runAsync(
        `UPDATE people
            SET display_name = ?, normalized_name = ?, updated_at = ?
          WHERE profile_id = ? AND id = ? AND is_self = 0`,
        [displayName, normalizedName, updatedAt, profileId, personId],
      );
      return result.changes;
    },

    async setStatus(profileId, personId, from, to, updatedAt) {
      // `status = ?` 把「我以为它现在是什么状态」写进条件，别处刚改过时只会改 0 行。
      const result = await db.runAsync(
        `UPDATE people
            SET status = ?, updated_at = ?
          WHERE profile_id = ? AND id = ? AND is_self = 0 AND status = ?`,
        [to, updatedAt, profileId, personId, from],
      );
      return result.changes;
    },

    async deleteIfUnreferenced(profileId, personId) {
      // 独占事务内外键检查不生效（PRAGMA foreign_keys 在事务中无法切换），
      // 所以「未被引用」必须写进这条语句本身。
      const result = await db.runAsync(
        `DELETE FROM people
          WHERE profile_id = ? AND id = ? AND is_self = 0
            AND NOT EXISTS (SELECT 1 FROM purchases WHERE purchaser_person_id = people.id)
            AND NOT EXISTS (SELECT 1 FROM usage_records WHERE person_id = people.id)`,
        [profileId, personId],
      );
      return result.changes;
    },
  };
}
