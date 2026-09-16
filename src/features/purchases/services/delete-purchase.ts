import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PurchaseServiceError } from './errors';

/**
 * 套餐永久删除用例。
 *
 * 这是第一版唯一一处物理删除：确认后套餐、它的项目与全部核销记录一起消失，
 * 没有回收站、没有 `deleted_at`、没有恢复入口（ADR-016、PRD-PUR-013）。
 * 机构不在删除范围内，它的生命周期由归档管理（PRD-PUR-014）。
 *
 * 单条核销走的是另一条路——撤销而不是删除，见 `void-redemption.ts`。
 */

/** 删除一个套餐会连带清除多少数据。核销数含已撤销的记录。 */
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
    redemptionCount: impact.redemption_count,
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

    // 2-3. 重新统计项目数与全部核销记录数（含已撤销），作为本次删除的真实结果。
    const impact = await repositories.purchases.getDeletionImpact(purchase.id);

    // 4. 删除。子表由 repository 在同一事务内按依赖顺序清理——独占事务的连接
    //    没有开启外键，表上的 CASCADE 在这里不会触发，详见 purchase-repository.ts。
    const deleted = await repositories.purchases.deletePermanently(
      DEFAULT_PROFILE_ID,
      purchase.id,
    );

    // 5. 删除行数必须正好是 1。0 表示这条套餐刚刚已被删除；此时抛出让事务回滚，
    //    上面清理子表的语句一并撤销，不会留下「项目没了、套餐还在」的半截状态。
    if (deleted !== 1) {
      throw new PurchaseServiceError(MISSING_MESSAGE);
    }

    return {
      purchaseId: purchase.id,
      purchaseName: purchase.name,
      itemCount: impact.item_count,
      redemptionCount: impact.redemption_count,
    };
  });
}
