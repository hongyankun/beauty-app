import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { toPersonSummary, type PersonSummary } from './person-view';

/** 单个人的详情查询，供编辑页使用。找不到时返回 null，由调用方决定怎么说。 */
export async function getPerson(
  dataAccess: DataAccess,
  personId: string,
): Promise<PersonSummary | null> {
  const row = await dataAccess.people.findDetailById(DEFAULT_PROFILE_ID, personId);
  return row === null ? null : toPersonSummary(row);
}
