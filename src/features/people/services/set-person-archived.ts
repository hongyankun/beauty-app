import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PersonServiceError } from './errors';
import { MISSING_MESSAGE, SELF_PROTECTED_MESSAGE, STALE_MESSAGE } from './person-rules';

/**
 * 归档与恢复使用人。
 *
 * 只改 `people.status`。已归档的人在历史中照常显示，只是不再出现在新建记录的
 * 选择器里；任何记录上的名称快照都不动（PRD 第 5B.4 节）。
 *
 * 恢复不需要再判重：已归档的人一直占用着自己的判重键（唯一索引覆盖全部状态），
 * 库里不可能同时存在一个同名的使用中的人。
 */
export async function setPersonArchived(
  dataAccess: DataAccess,
  personId: string,
  nextArchived: boolean,
): Promise<void> {
  const next = nextArchived ? 'archived' : 'active';
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    const existing = await repositories.people.findById(DEFAULT_PROFILE_ID, personId);
    if (existing === null) {
      throw new PersonServiceError(MISSING_MESSAGE);
    }
    if (existing.is_self === 1) {
      throw new PersonServiceError(SELF_PROTECTED_MESSAGE);
    }
    if (existing.status === next) {
      // 已经是目标状态：连点两次或别处已改过，没有要写的东西。
      return;
    }
    const changed = await repositories.people.setStatus(
      DEFAULT_PROFILE_ID,
      existing.id,
      existing.status,
      next,
      now,
    );
    if (changed !== 1) {
      throw new PersonServiceError(STALE_MESSAGE);
    }
  });
}
