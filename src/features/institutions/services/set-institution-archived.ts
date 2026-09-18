import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { InstitutionServiceError } from './errors';
import { MISSING_MESSAGE, STALE_MESSAGE } from './institution-rules';

/**
 * 归档与恢复机构用例。
 *
 * 归档与恢复都**不是删除**：只改 `institutions.is_archived` 这一列。
 * 套餐、项目、核销记录、剩余次数与累计投入全部不受影响，历史记录里的
 * 机构与城市快照也一个字都不动（任务书第七、八节）。
 *
 * 这里不出现 DELETE，也不依赖 `ON DELETE RESTRICT`：被引用的机构照样可以
 * 归档，归档只是让它不再出现在新增套餐与新增核销的机构选择器里。
 */

/** 恢复时撞上一个使用中的同名机构。文案不暴露 UNIQUE、表名与 SQL。 */
function restoreConflictMessage(name: string): string {
  return `已经有一个使用中的机构叫「${name}」，恢复后会出现两个同名机构。可以先给其中一个改名，再恢复这一个。`;
}

export async function setInstitutionArchived(
  dataAccess: DataAccess,
  institutionId: string,
  nextArchived: boolean,
): Promise<void> {
  const next = nextArchived ? 1 : 0;
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    const existing = await repositories.institutions.findById(DEFAULT_PROFILE_ID, institutionId);
    if (existing === null) {
      throw new InstitutionServiceError(MISSING_MESSAGE);
    }

    if (existing.is_archived === next) {
      // 已经是目标状态了。连点两次、或者在另一个页面已经改过，结果都一样，
      // 没有任何要写的东西，也没有必要报错吓用户一跳。
      return;
    }

    if (next === 0) {
      // 恢复会让它重新出现在机构选择器里，因此要先确认那时不会同时出现
      // 两个同名的可选项（任务书第八节）。
      //
      // 只有**使用中**的同名机构才算冲突：另一条也在归档里时，两者都不会
      // 出现在选择器中，恢复这一条并不会新增一个用户看得见的重名
      // （库里可能本就存在历史同名机构，本轮不清理也不合并）。
      const conflict = await repositories.institutions.findConflict(
        DEFAULT_PROFILE_ID,
        existing.normalized_name,
        existing.id,
      );
      if (conflict !== null && conflict.is_archived === 0) {
        throw new InstitutionServiceError(restoreConflictMessage(conflict.name));
      }
    }

    // `expectedArchived` 写进 WHERE：状态已经不是刚才读到的那个值时只会改 0 行，
    // 此时整体回滚并提示刷新，而不是把一个未知的新状态盖掉（任务书第十节）。
    const changed = await repositories.institutions.setArchived(
      DEFAULT_PROFILE_ID,
      existing.id,
      existing.is_archived,
      next,
      now,
    );
    if (changed !== 1) {
      throw new InstitutionServiceError(STALE_MESSAGE);
    }
  });
}
