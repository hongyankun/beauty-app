import type { SQLiteDatabase } from 'expo-sqlite';

import type { PersonRow } from '../types';
import type { PeopleRepository } from './types';

/**
 * 使用人的 SQLite 实现。人员管理页面属于 BT-0020，这里只提供兼容层需要的读取。
 */
export function createPeopleRepository(db: SQLiteDatabase): PeopleRepository {
  return {
    async findSelf(profileId) {
      // 按 `(profile_id, is_self = 1)` 查找，命中唯一部分索引 idx_people_single_self；
      // 不依赖固定 ID（DATA_MODEL_V4 第 4.2 节）。
      const row = await db.getFirstAsync<PersonRow>(
        `SELECT id, profile_id, display_name, normalized_name, is_self, status, created_at, updated_at
           FROM people
          WHERE profile_id = ? AND is_self = 1
          LIMIT 1`,
        [profileId],
      );
      return row ?? null;
    },
  };
}
