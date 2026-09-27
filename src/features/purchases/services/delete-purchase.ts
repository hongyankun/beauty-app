import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PurchaseServiceError } from './errors';

/**
 * 套餐永久删除用例。
 *
 * 确认后套餐与它的项目一起消失，没有回收站、没有 `deleted_at`、没有恢复入口
 * （ADR-016、PRD-PUR-013）。
 *
 * schema v4 起**真实历史不随套餐删除**（ADR-021、PRD 第 5B.7 节）：
 * 引用这个套餐的使用记录（含已撤销）改为「原套餐已删除」，解除与项目的关联，
 * 快照、使用人、状态与撤销信息原样保留；变美记录一条不删。
 * 机构与人不在删除范围内，它们的生命周期由归档管理（PRD-PUR-014）。
 *
 * 单条核销走的是另一条路——撤销而不是删除，见 `void-redemption.ts`。
 */

/**
 * 删除一个套餐的影响范围。
 *
 * `redemptionCount` 是**会被保留、但不再关联这个套餐**的使用记录数（含已撤销），
 * 不是被删除的条数；字段名沿用兼容层的叫法。
 */
export type PurchaseDeletionImpact = {
  readonly purchaseId: string;
  readonly purchaseName: string;
  readonly itemCount: number;
  readonly redemptionCount: number;
};

const MISSING_MESSAGE = '这个套餐已经不存在了，可能已经被删除';

/**
 * 确认框要展示的影响范围。套餐不存在或不属于当前档案时返回 null。
 *
 * 数量必须来自这里、来自数据库，不能用页面上那个数组的长度：
 * 详情页的数据可能是几分钟前读的，而用户马上要做的是不可恢复的操作
 * （任务书第八节）。
 */
export async function getPurchaseDeletionImpact(
  dataAccess: DataAccess,
  purchaseId: string,
): Promise<PurchaseDeletionImpact | null> {
  const purchase = await dataAccess.purchases.findById(DEFAULT_PROFILE_ID, purchaseId);
  if (purchase === null) {
    return null;
  }

  const impact = await dataAccess.purchases.getDeletionImpact(purchase.id);
  return {
    purchaseId: purchase.id,
    purchaseName: purchase.name,
    itemCount: impact.item_count,
    redemptionCount: impact.usage_count,
  };
}

/**
 * 永久删除一个套餐，返回实际被删除的内容。
 *
 * 事务内重新确认与重新统计，不复用确认框里那份数字：从用户看到确认框到
 * 点下「永久删除」之间，套餐可能已经在别处被删掉了。
 *
 * 失败时抛 `PurchaseServiceError`（文案可直接展示）或原始异常。
 */
export async function deletePurchasePermanently(
  dataAccess: DataAccess,
  purchaseId: string,
): Promise<PurchaseDeletionImpact> {
  return dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新确认套餐存在且属于当前档案。
    const purchase = await repositories.purchases.findById(DEFAULT_PROFILE_ID, purchaseId);
    if (purchase === null) {
      throw new PurchaseServiceError(MISSING_MESSAGE);
    }

    // 2. 重新统计项目数与引用它们的使用记录数（含已撤销），作为本次删除的真实结果；
    //    同时记下变美记录总数，删除之后必须一条不少。
    const impact = await repositories.purchases.getDeletionImpact(purchase.id);
    const eventsBefore = await repositories.redemptions.countEvents(DEFAULT_PROFILE_ID);

    // 3. 先解除使用记录与项目的关联，再删项目：顺序反过来，使用记录就会指向
    //    已经不存在的项目。改动行数必须等于刚才统计的条数。
    const now = new Date().toISOString();
    const detached = await repositories.purchases.detachUsagesFromPurchase(purchase.id, now);
    if (detached !== impact.usage_count) {
      throw new Error('解除使用记录关联的条数与统计不一致');
    }

    // 4. 删除项目与套餐。独占事务的连接没有开启外键，表上的约束在这里不会拦截，
    //    所以下面逐条自检，详见 purchase-repository.ts。
    const deleted = await repositories.purchases.deletePermanently(
      DEFAULT_PROFILE_ID,
      purchase.id,
    );

    // 5. 删除行数必须正好是 1。0 表示这条套餐刚刚已被删除；此时抛出让事务回滚，
    //    上面的改动一并撤销，不会留下「项目没了、套餐还在」的半截状态。
    if (deleted !== 1) {
      throw new PurchaseServiceError(MISSING_MESSAGE);
    }

    // 6. 自检：没有使用记录还指向这个套餐的项目，变美记录总数没有变化。
    const stillLinked = await repositories.purchases.countUsagesLinkedToPurchase(purchase.id);
    const eventsAfter = await repositories.redemptions.countEvents(DEFAULT_PROFILE_ID);
    if (stillLinked !== 0 || eventsAfter !== eventsBefore) {
      throw new Error('删除套餐后的历史自检没有通过');
    }

    return {
      purchaseId: purchase.id,
      purchaseName: purchase.name,
      itemCount: impact.item_count,
      redemptionCount: impact.usage_count,
    };
  });
}
