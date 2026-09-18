import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { InstitutionServiceError } from './errors';
import {
  conflictMessage,
  MISSING_MESSAGE,
  normalizeOptionalText,
  prepareInstitutionName,
  STALE_MESSAGE,
} from './institution-rules';

/**
 * 编辑机构主数据用例。
 *
 * 只写 `institutions` 这一行。**不碰** `purchases` 与 `redemption_records`
 * 上的 `institution_name_snapshot` 与 `city_snapshot`：那两份文本记录的是
 * 「那一次购买/核销当时的机构叫什么、在哪个城市」，是历史事实，
 * 不随主数据改名而变（PRD 第 5A.2 节、PRD-INST-005、PRD-PUR-018）。
 * 产品上也没有「同步更新历史记录」这个动作（任务书第六节）。
 *
 * 机构 ID、`profile_id`、`created_at` 与 `is_archived` 都不在可写范围内：
 * ID 不变，历史记录与它的外键关联自然一条都不会断。
 */

export type UpdateInstitutionInput = {
  readonly institutionId: string;
  readonly name: string;
  readonly city: string | null;
  readonly notes: string | null;
};

export async function updateInstitution(
  dataAccess: DataAccess,
  input: UpdateInstitutionInput,
): Promise<void> {
  // 入参自身的校验不需要读库，放在事务外，省得为一个必然失败的请求开事务。
  const { name, normalizedName } = prepareInstitutionName(input.name);
  const city = normalizeOptionalText(input.city);
  const notes = normalizeOptionalText(input.notes);
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新确认它还在，而且属于当前档案。页面上的那份数据是打开
    //    那一刻读到的，可能已经过时。
    const existing = await repositories.institutions.findById(
      DEFAULT_PROFILE_ID,
      input.institutionId,
    );
    if (existing === null) {
      throw new InstitutionServiceError(MISSING_MESSAGE);
    }

    // 2. 只有判重键真的变了才查冲突。
    //
    //    库里可能本来就存在历史同名机构（ADR-014 允许并存，本轮也不清理、
    //    不合并）。只改城市或备注、或者改名后归一化结果没变时，这次保存
    //    并不会**新增**一个冲突，不该被历史遗留数据挡住。
    if (normalizedName !== existing.normalized_name) {
      const conflict = await repositories.institutions.findConflict(
        DEFAULT_PROFILE_ID,
        normalizedName,
        existing.id,
      );
      if (conflict !== null) {
        // 抛出即回滚，什么都没写进去。
        throw new InstitutionServiceError(conflictMessage(conflict));
      }
    }

    // 3. 写入。受影响行数对不上就回滚——它要么已被删除，要么已不属于本档案，
    //    两种情况都不该把一份过时的输入盖上去。
    const changed = await repositories.institutions.updateDetails({
      id: existing.id,
      profile_id: DEFAULT_PROFILE_ID,
      name,
      normalized_name: normalizedName,
      city,
      notes,
      updated_at: now,
    });
    if (changed !== 1) {
      throw new InstitutionServiceError(STALE_MESSAGE);
    }
  });
}
