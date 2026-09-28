import { DEFAULT_PROFILE_ID, type RepositoryBundle } from '@/db';
import { PurchaseServiceError } from './errors';

/**
 * 购买人的解析规则，新增与编辑套餐共用（PRD 第 5B.4、5B.5 节）。
 *
 * 必须在事务内调用：人员是否存在、是否属于当前档案、是否仍在使用中，都以事务内读到的
 * 库值为准，不信任页面上停留时读到的列表。任何一条不成立都抛 `PurchaseServiceError`，
 * 调用方的事务因此整体回滚、不写入任何一行。
 */

export type ResolvedPurchaser = {
  readonly personId: string;
  readonly nameSnapshot: string;
};

/** 库里现有的购买人。编辑时传入；新增时为 null。 */
export type StoredPurchaser = {
  readonly purchaser_person_id: string;
  readonly purchaser_name_snapshot: string;
};

const PURCHASER_MISSING_MESSAGE = '选择的购买人已经不存在了，请重新选择购买人';
const PURCHASER_ARCHIVED_MESSAGE = '选择的购买人已经归档，请重新选择购买人';

export async function resolvePurchaser(
  repositories: RepositoryBundle,
  personId: string,
  stored: StoredPurchaser | null,
): Promise<ResolvedPurchaser> {
  // 编辑时没改购买人：ID 与名称快照原样保留。即使这个人后来改名或已归档，
  // 历史上「当时是谁买的」也不被改写（快照永不回写）。
  if (stored !== null && stored.purchaser_person_id === personId) {
    return { personId, nameSnapshot: stored.purchaser_name_snapshot };
  }

  // 按 (profile_id, id) 查，伪造的 ID 与其他档案的人一律查不到。
  const person = await repositories.people.findById(DEFAULT_PROFILE_ID, personId);
  if (person === null) {
    throw new PurchaseServiceError(PURCHASER_MISSING_MESSAGE);
  }
  // 新选的人必须仍在使用中；已归档的人只能作为「原值」保留，不能被重新选中。
  if (person.status !== 'active') {
    throw new PurchaseServiceError(PURCHASER_ARCHIVED_MESSAGE);
  }
  // 快照取事务内读到的当前名称，不信任页面上显示的那一份。
  return { personId: person.id, nameSnapshot: person.display_name };
}
