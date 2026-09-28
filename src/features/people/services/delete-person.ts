import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PersonServiceError } from './errors';
import {
  MISSING_MESSAGE,
  REFERENCED_MESSAGE,
  SELF_PROTECTED_MESSAGE,
} from './person-rules';

/**
 * 删除一个从未被任何记录用过的人。
 *
 * 「未被引用」由 DELETE 语句自身的 NOT EXISTS 条件保证，不依赖事务里读到的计数：
 * 页面打开之后别处新增了引用，这条语句只会删 0 行（PRD 第 5B.4 节）。
 */
export async function deletePerson(dataAccess: DataAccess, personId: string): Promise<void> {
  await dataAccess.transaction(async (repositories) => {
    const existing = await repositories.people.findById(DEFAULT_PROFILE_ID, personId);
    if (existing === null) {
      throw new PersonServiceError(MISSING_MESSAGE);
    }
    if (existing.is_self === 1) {
      throw new PersonServiceError(SELF_PROTECTED_MESSAGE);
    }
    const changed = await repositories.people.deleteIfUnreferenced(DEFAULT_PROFILE_ID, existing.id);
    if (changed !== 1) {
      throw new PersonServiceError(REFERENCED_MESSAGE);
    }
  });
}
