import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
} from '@/db';
import { isBusinessDate } from '@/utils/business-date';
import { createUuid } from '@/utils/uuid';
import { PurchaseServiceError } from './errors';
import { resolveInstitution, type InstitutionSelection } from './institution-selection';

/**
 * 新增单次核销用例。
 *
 * 余次从来不是一个可以读出来再写回去的字段，它是「购买次数 − 有效核销数」。
 * 因此「还能不能核销」这个判断必须和插入发生在**同一个独占事务**里：
 * 页面上读到的余次随时可能已经过期（另一处刚核销过、用户连点了两下、
 * 详情页停在后台很久），只有事务内重算的结果才算数（任务书第八、十一节）。
 */

export type CreateRedemptionInput = {
  readonly purchaseItemId: string;
  /** 核销日期，YYYY-MM-DD */
  readonly redeemedOn: BusinessDate;
  readonly institution: InstitutionSelection;
  readonly city: string | null;
  readonly notes: string | null;
};

/**
 * 记录一次核销，返回新核销记录的 ID。
 *
 * 有效期不参与这里的判断：套餐过期既不会清零余次，也不会拒绝保存，
 * 提醒发生在界面层的二次确认里（ADR-017、任务书第十节）。
 *
 * 失败时抛 `PurchaseServiceError`（业务原因，文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。
 */
export async function createRedemption(
  dataAccess: DataAccess,
  input: CreateRedemptionInput,
): Promise<string> {
  if (!isBusinessDate(input.redeemedOn)) {
    throw new PurchaseServiceError('核销日期不是一个真实存在的日期');
  }

  const now = new Date().toISOString();
  const city = input.city === null || input.city.trim() === '' ? null : input.city.trim();
  const notes = input.notes === null || input.notes.trim() === '' ? null : input.notes.trim();

  return dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新读取项目。顺带校验它属于当前档案：purchase_items 自己
    //    没有 profile_id，归属只能通过 JOIN 套餐得到。
    const item = await repositories.purchases.findItemContext(
      DEFAULT_PROFILE_ID,
      input.purchaseItemId,
    );
    if (item === null) {
      throw new PurchaseServiceError('这个项目已经不存在了，请返回上一页重新进入');
    }

    // 2. 事务内统计有效核销数，3. 据此算出此刻真实的剩余次数。
    const activeRedemptionCount = await repositories.redemptions.countActiveByItem(item.id);
    const remaining = item.quantity - activeRedemptionCount;

    // 4. 余次不足直接拒绝。这一层是最终防线：界面上的禁用只是提前告知，
    //    真正保证余次不会变成负数的是这里（E-05、任务书第十一节）。
    if (remaining <= 0) {
      throw new PurchaseServiceError('这个项目已经没有剩余次数，无法再记录核销');
    }

    // 5. 创建或复用机构，与新增套餐共用同一套判重规则（ADR-014）。
    const institution = await resolveInstitution(repositories, input.institution, city, now);

    // 6. 插入一条有效核销。快照写的是**这次核销当时**的机构与城市，
    //    未填写机构时写 null 而不是空字符串（任务书第九节）。
    const redemptionId = createUuid();
    await repositories.redemptions.insert({
      id: redemptionId,
      purchase_item_id: item.id,
      institution_id: institution?.id ?? null,
      institution_name_snapshot: institution?.name ?? null,
      city_snapshot: city ?? institution?.city ?? null,
      redeemed_on: input.redeemedOn,
      status: 'active',
      notes,
      created_at: now,
      updated_at: now,
      // 作废字段只有撤销核销时才会写；active 记录必须留空（表级 CHECK 约束）。
      voided_at: null,
      void_reason: null,
    });

    // 7. 任一步抛出异常，整个事务回滚，不会留下半条核销。
    return redemptionId;
  });
}
