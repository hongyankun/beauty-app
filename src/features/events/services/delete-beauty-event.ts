import { DEFAULT_PROFILE_ID, type DataAccess, type EventUsageRow } from '@/db';
import { PurchaseServiceError } from '@/features/purchases/services/errors';

/**
 * 删除变美记录用例（DATA_MODEL_V4 第 5.4 节，PRD 第 5B.2 节）。
 *
 * 删除整条变美记录及其下**全部**使用记录（含已撤销）。确认框显示将删除的使用记录数，
 * 以及其中会退回套餐的次数：只有**有效**且仍关联购买项目的记录才占用余次，已撤销的
 * 早已不占用，不会被重复退回。套餐、项目、机构与人员一行都不动。
 *
 * 不可恢复，没有回收站。
 */

export type BeautyEventDeletionImpact = {
  /** 将一并删除的使用记录条数，含已撤销 */
  readonly usageCount: number;
  /** 其中会退回套餐的次数：有效且仍关联购买项目的记录数 */
  readonly returnedCount: number;
};

function impactOf(usages: readonly EventUsageRow[]): BeautyEventDeletionImpact {
  return {
    usageCount: usages.length,
    returnedCount: usages.filter((usage) => usage.status === 'active' && usage.purchase_item_id !== null)
      .length,
  };
}

const EVENT_MISSING_MESSAGE = '这条变美记录已经不存在了，可能已经被删除';

/** 打开确认框前读取影响范围。 */
export async function getBeautyEventDeletionImpact(
  dataAccess: DataAccess,
  eventId: string,
): Promise<BeautyEventDeletionImpact> {
  const event = await dataAccess.events.findEvent(DEFAULT_PROFILE_ID, eventId);
  if (event === null) {
    throw new PurchaseServiceError(EVENT_MISSING_MESSAGE);
  }
  return impactOf(await dataAccess.events.listEventUsages(event.id));
}

export type DeleteBeautyEventInput = {
  readonly eventId: string;
  /** 用户在确认框里看到的影响范围；事务内重算后对不上就拒绝，请用户刷新后再确认 */
  readonly confirmedImpact: BeautyEventDeletionImpact;
};

export async function deleteBeautyEvent(
  dataAccess: DataAccess,
  input: DeleteBeautyEventInput,
): Promise<void> {
  await dataAccess.transaction(async (repositories) => {
    const event = await repositories.events.findEvent(DEFAULT_PROFILE_ID, input.eventId);
    if (event === null) {
      // 重复删除走到这里：明确拒绝，不假装成功。
      throw new PurchaseServiceError(EVENT_MISSING_MESSAGE);
    }

    const usages = await repositories.events.listEventUsages(event.id);
    const impact = impactOf(usages);
    if (
      impact.usageCount !== input.confirmedImpact.usageCount ||
      impact.returnedCount !== input.confirmedImpact.returnedCount
    ) {
      throw new PurchaseServiceError('这条变美记录刚刚有变化，请刷新后重新确认');
    }

    // 先删使用记录再删事件：事务连接没有开启外键，不能指望 ON DELETE CASCADE。
    const deletedUsages = await repositories.events.deleteEventUsages(event.id);
    const deletedEvents = await repositories.events.deleteEvent(DEFAULT_PROFILE_ID, event.id);
    if (
      deletedUsages !== impact.usageCount ||
      deletedEvents !== 1 ||
      (await repositories.redemptions.countEventUsages(event.id)) !== 0
    ) {
      throw new PurchaseServiceError('没能删除这条变美记录，请重试');
    }
  });
}
