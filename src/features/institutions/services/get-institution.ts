import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { toInstitutionSummary, type InstitutionSummary } from './institution-view';

/**
 * 单个机构的详情查询用例，供编辑页使用。
 *
 * 比列表多带一个 `notes` 全文：卡片上显示的是首行摘要，
 * 但编辑框里必须是用户原本写的那一段，不能被摘要覆盖掉。
 */
export type InstitutionDetail = InstitutionSummary & {
  /** 备注全文；没填时为 null */
  readonly notes: string | null;
};

/** 找不到时返回 null，由调用方决定怎么说，不在这里编造一个空对象。 */
export async function getInstitution(
  dataAccess: DataAccess,
  institutionId: string,
): Promise<InstitutionDetail | null> {
  const row = await dataAccess.institutions.findDetailById(DEFAULT_PROFILE_ID, institutionId);
  if (row === null) {
    return null;
  }
  return { ...toInstitutionSummary(row), notes: row.notes };
}
