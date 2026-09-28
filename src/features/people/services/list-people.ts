import { DEFAULT_PROFILE_ID, type DataAccess, type PersonStatus } from '@/db';
import { toPersonSummary, type PersonSummary } from './person-view';

/**
 * 使用人列表查询用例。
 *
 * 只读当前档案：`profile_id` 条件写在 SQL 里。排序由 SQL 完成，「自己」永远排第一。
 */

/** 页面上的两个筛选，与库里的 `status` 取值一致。 */
export type PersonFilter = PersonStatus;

export type PersonListResult = {
  readonly filter: PersonFilter;
  readonly totalCount: number;
  readonly entries: readonly PersonSummary[];
};

export async function listPeople(
  dataAccess: DataAccess,
  filter: PersonFilter,
): Promise<PersonListResult> {
  const rows = await dataAccess.people.listWithUsage(DEFAULT_PROFILE_ID, filter);
  const entries = rows.map(toPersonSummary);
  return { filter, totalCount: entries.length, entries };
}
