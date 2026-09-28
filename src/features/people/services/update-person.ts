import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PersonServiceError } from './errors';
import {
  conflictMessage,
  MISSING_MESSAGE,
  preparePersonName,
  SELF_PROTECTED_MESSAGE,
  STALE_MESSAGE,
} from './person-rules';

/**
 * 给使用人改名。
 *
 * 只写 `people` 这一行，**不碰**购买记录与使用记录上的名称快照：
 * 改名后旧记录仍显示旧名称（PRD 第 5B.4、5B.5 节，PRD-PERSON-003）。
 */
export async function updatePerson(
  dataAccess: DataAccess,
  personId: string,
  rawName: string,
): Promise<void> {
  const { name, normalizedName } = preparePersonName(rawName);
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    const existing = await repositories.people.findById(DEFAULT_PROFILE_ID, personId);
    if (existing === null) {
      throw new PersonServiceError(MISSING_MESSAGE);
    }
    if (existing.is_self === 1) {
      throw new PersonServiceError(SELF_PROTECTED_MESSAGE);
    }
    if (name === existing.display_name) {
      return;
    }

    // 只有判重键变了才查冲突：只改大小写或空格时，占用的还是自己原来的那个键。
    if (normalizedName !== existing.normalized_name) {
      const conflict = await repositories.people.findConflict(
        DEFAULT_PROFILE_ID,
        normalizedName,
        existing.id,
      );
      if (conflict !== null) {
        throw new PersonServiceError(conflictMessage(conflict));
      }
    }

    const changed = await repositories.people.updateName(
      DEFAULT_PROFILE_ID,
      existing.id,
      name,
      normalizedName,
      now,
    );
    if (changed !== 1) {
      throw new PersonServiceError(STALE_MESSAGE);
    }
  });
}
