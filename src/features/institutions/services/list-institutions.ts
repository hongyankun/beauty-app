import { DEFAULT_PROFILE_ID, type DataAccess, type SqliteBoolean } from '@/db';
import { toInstitutionSummary, type InstitutionSummary } from './institution-view';

/**
 * 机构列表查询用例。
 *
 * 只读当前档案（ADR-015）：`profile_id` 条件写在 SQL 里，别的档案的机构
 * 连查询结果都进不来，不靠页面过滤。
 *
 * 排序由 SQL 完成，这里不再重排。
 */

/** 页面上的两个筛选。用用户语言表达，不暴露 `is_archived` 这样的列名。 */
export type InstitutionFilter = 'active' | 'archived';

/** 界面筛选 → 数据库取值。两套词汇之间唯一的翻译点。 */
const ARCHIVED_FLAGS: Readonly<Record<InstitutionFilter, SqliteBoolean>> = {
  active: 0,
  archived: 1,
};

export type InstitutionListResult = {
  /** 这份结果对应哪个筛选。页面用它确认拿到的是不是当前选中的那一份 */
  readonly filter: InstitutionFilter;
  /** 当前筛选下的真实条数，等于 `entries.length` */
  readonly totalCount: number;
  readonly entries: readonly InstitutionSummary[];
};

export async function listInstitutions(
  dataAccess: DataAccess,
  filter: InstitutionFilter,
): Promise<InstitutionListResult> {
  const rows = await dataAccess.institutions.listWithUsage(
    DEFAULT_PROFILE_ID,
    ARCHIVED_FLAGS[filter],
  );
  const entries = rows.map(toInstitutionSummary);
  return { filter, totalCount: entries.length, entries };
}
