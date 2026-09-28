import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { createUuid } from '@/utils/uuid';
import { PersonServiceError } from './errors';
import { conflictMessage, preparePersonName } from './person-rules';

/**
 * 新增使用人用例。只有一个名称，不收集任何其他个人信息（PRD 第 5B.4 节）。
 *
 * 新增的人永远不是「自己」、永远是使用中——这两个值写死在 SQL 里，
 * 调用方没有办法传进来。
 */
export async function createPerson(dataAccess: DataAccess, rawName: string): Promise<string> {
  const { name, normalizedName } = preparePersonName(rawName);
  const id = createUuid();
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    // 判重覆盖使用中、已归档与「自己」。与写入处在同一个独占事务内，没有竞态窗口。
    const conflict = await repositories.people.findConflict(DEFAULT_PROFILE_ID, normalizedName, null);
    if (conflict !== null) {
      throw new PersonServiceError(conflictMessage(conflict));
    }
    await repositories.people.insertOther({
      id,
      profile_id: DEFAULT_PROFILE_ID,
      display_name: name,
      normalized_name: normalizedName,
      created_at: now,
    });
  });

  return id;
}
