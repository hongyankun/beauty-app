import type { SQLiteDatabase } from 'expo-sqlite';

import type { InstitutionRow } from '../types';
import type {
  InstitutionConflictRow,
  InstitutionOption,
  InstitutionRepository,
  InstitutionUsageRow,
} from './types';

/**
 * 机构的 SQLite 实现。
 *
 * 全部语句使用 `?` 绑定参数，不做任何字符串拼接（ARCHITECTURE 第三节）。
 * 列名逐条写出而不是 `SELECT *`：加列时查询结果类型不会悄悄漂移。
 */

/** 机构主数据的全部列，`findById` 与 `findByNormalizedName` 共用。 */
const INSTITUTION_COLUMNS =
  'id, profile_id, name, normalized_name, city, notes, is_archived, created_at, updated_at';

/**
 * 机构主数据 + 两个关联计数。
 *
 * 计数用**相关子查询**而不是 JOIN + GROUP BY：一个机构同时关联 3 个套餐和
 * 5 条核销时，两张表 JOIN 在一起会得到 15 行，两个 COUNT 互相放大成 15 和 15。
 * 子查询各自独立求值，不会互相污染。
 *
 * 核销计数不带 `status` 条件：已撤销的核销同样是历史（任务书第四节）。
 * 两个计数都只认外键，不碰名称快照。
 */
const USAGE_COLUMNS = `i.id, i.name, i.city, i.notes, i.is_archived, i.created_at, i.updated_at,
          (SELECT COUNT(*) FROM purchases p WHERE p.institution_id = i.id) AS purchase_count,
          (SELECT COUNT(*) FROM redemption_records r WHERE r.institution_id = i.id) AS redemption_count`;

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

    async listWithUsage(profileId, isArchived) {
      return db.getAllAsync<InstitutionUsageRow>(
        `SELECT ${USAGE_COLUMNS}
           FROM institutions i
          WHERE i.profile_id = ? AND i.is_archived = ?
          ORDER BY i.updated_at DESC, i.created_at DESC, i.id ASC`,
        [profileId, isArchived],
      );
    },

    async findDetailById(profileId, institutionId) {
      const row = await db.getFirstAsync<InstitutionUsageRow>(
        `SELECT ${USAGE_COLUMNS}
           FROM institutions i
          WHERE i.profile_id = ? AND i.id = ?
          LIMIT 1`,
        [profileId, institutionId],
      );
      return row ?? null;
    },

    async findByNormalizedName(profileId, normalizedName) {
      // 已归档的机构也会被找到：再次输入一个归档机构的名称时，正确做法是
      // 恢复原来那一条并复用它的 ID，而不是新建第二条同名机构（任务书第九节）。
      // `is_archived ASC` 让未归档的优先，历史数据里万一已经一活一档并存，
      // 复用到的仍然是用户正在使用的那一条。
      const row = await db.getFirstAsync<InstitutionRow>(
        `SELECT ${INSTITUTION_COLUMNS}
           FROM institutions
          WHERE profile_id = ? AND normalized_name = ?
          ORDER BY is_archived ASC, created_at ASC
          LIMIT 1`,
        [profileId, normalizedName],
      );
      return row ?? null;
    },

    async findConflict(profileId, normalizedName, excludeId) {
      const row = await db.getFirstAsync<InstitutionConflictRow>(
        `SELECT id, name, is_archived
           FROM institutions
          WHERE profile_id = ? AND normalized_name = ? AND id <> ?
          ORDER BY is_archived ASC, created_at ASC
          LIMIT 1`,
        [profileId, normalizedName, excludeId],
      );
      return row ?? null;
    },

    async findById(profileId, institutionId) {
      const row = await db.getFirstAsync<InstitutionRow>(
        `SELECT ${INSTITUTION_COLUMNS}
           FROM institutions
          WHERE profile_id = ? AND id = ?
          LIMIT 1`,
        [profileId, institutionId],
      );
      return row ?? null;
    },

    async updateDetails(row) {
      // WHERE 同时带 id 与 profile_id：跨档案的写入连语句层面都不成立。
      // 不写 profile_id、created_at、is_archived，也完全不触碰
      // purchases 与 redemption_records 上的机构与城市快照（PRD-INST-005）。
      const result = await db.runAsync(
        `UPDATE institutions
            SET name = ?, normalized_name = ?, city = ?, notes = ?, updated_at = ?
          WHERE id = ? AND profile_id = ?`,
        [
          row.name,
          row.normalized_name,
          row.city,
          row.notes,
          row.updated_at,
          row.id,
          row.profile_id,
        ],
      );
      return result.changes;
    },

    async setArchived(profileId, institutionId, expectedArchived, nextArchived, updatedAt) {
      // `is_archived = ?` 把「我以为它现在是什么状态」写进条件。别处刚改过时
      // 这条语句只会改 0 行，调用方据此回滚并提示刷新，不会盖掉未知的新状态。
      const result = await db.runAsync(
        `UPDATE institutions
            SET is_archived = ?, updated_at = ?
          WHERE id = ? AND profile_id = ? AND is_archived = ?`,
        [nextArchived, updatedAt, institutionId, profileId, expectedArchived],
      );
      return result.changes;
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
