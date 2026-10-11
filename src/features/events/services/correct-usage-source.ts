import { DEFAULT_PROFILE_ID, type DataAccess, type RepositoryBundle, type UsageRecordRow } from '@/db';
import { PurchaseServiceError } from '@/features/purchases/services/errors';
import { compareBusinessDates } from '@/utils/business-date';
import {
  listUsageSourceCandidates,
  type UsageSourceCandidate,
} from './list-usage-source-candidates';
import { isCompatibleTarget, SOURCE_KIND_BY_PURCHASE_KIND } from './usage-snapshots';

/**
 * 修正已保存使用记录的来源（DATA_MODEL_V4 第 5.5 节，冻结规则，BT-0023 只负责实现）。
 *
 * 只改「这一次从哪里扣」，不改「做了什么」：
 * - 只有**有效**记录可以修正；已撤销的记录不能修正。
 * - 目标只能是一个兼容（同一项目）且仍有余次的购买项目、外部来源或暂不关联；
 *   任何记录都不能被改成「原套餐已删除」。目标与当前来源相同视为未修改。
 * - 关联到购买项目时只更新来源快照（套餐名称、项目名称）为目标此刻的名称；
 *   改为外部来源或暂不关联时，全部快照原样保留。项目快照、使用人、事件、状态与备注一律不变，
 *   任何 Purchase、PurchaseItem 与 BeautyEvent 行都不变。
 * - 事件日期晚于目标购买的有效期时，必须带上用户的确认（ADR-017），否则拒绝写入。
 */

export type UsageSourceTarget =
  | { readonly kind: 'purchase_item'; readonly purchaseItemId: string }
  | { readonly kind: 'external' }
  | { readonly kind: 'unlinked' };

export type CorrectUsageSourceInput = {
  readonly usageId: string;
  readonly target: UsageSourceTarget;
  /** 用户已经确认「事件日期晚于目标套餐有效期」仍要关联 */
  readonly confirmedAfterExpiry: boolean;
};

export type CorrectUsageSourceResult = {
  /** false 表示目标与当前来源相同，没有写入 */
  readonly changed: boolean;
};

const USAGE_MISSING_MESSAGE = '这条使用记录已经不存在了，请返回上一页';
const USAGE_VOIDED_MESSAGE = '已撤销的记录不能修改来源。如需正确记录，请重新记录一次';

export async function correctUsageSource(
  dataAccess: DataAccess,
  input: CorrectUsageSourceInput,
): Promise<CorrectUsageSourceResult> {
  const target = input.target;
  // 输入可能是构造出来的：不认识的目标（包括「原套餐已删除」）一律拒绝。
  if (target.kind !== 'purchase_item' && target.kind !== 'external' && target.kind !== 'unlinked') {
    throw new PurchaseServiceError('不能改成这个来源，请重新选择');
  }
  const now = new Date().toISOString();

  return dataAccess.transaction(async (repositories) => {
    // 1. 重读这条记录：存在、属于当前档案、仍然有效。
    const usage = await repositories.events.findUsage(DEFAULT_PROFILE_ID, input.usageId);
    if (usage === null) {
      throw new PurchaseServiceError(USAGE_MISSING_MESSAGE);
    }
    if (usage.status !== 'active') {
      throw new PurchaseServiceError(USAGE_VOIDED_MESSAGE);
    }

    if (target.kind === 'external' || target.kind === 'unlinked') {
      if (usage.source_kind === target.kind) {
        return { changed: false };
      }
      // 释放套餐次数，但所有快照（含套餐名称与项目名称）原样保留。
      await writeSource(repositories, usage, {
        source_kind: target.kind,
        purchase_item_id: null,
        purchase_name_snapshot: usage.purchase_name_snapshot,
        purchase_item_name_snapshot: usage.purchase_item_name_snapshot,
        updated_at: now,
      });
      return { changed: true };
    }

    if (usage.purchase_item_id === target.purchaseItemId) {
      return { changed: false };
    }

    // 2. 目标项目：同一档案、仍然存在、与这条记录是同一个项目、仍有余次。
    const item = await repositories.purchases.findItemContext(DEFAULT_PROFILE_ID, target.purchaseItemId);
    if (item === null) {
      throw new PurchaseServiceError('选择的套餐项目已经不存在了，请重新选择');
    }
    if (!isCompatibleTarget(usage, item)) {
      throw new PurchaseServiceError('只能关联到同一个项目的套餐。记错了项目请撤销这条记录后重新记录');
    }
    // 这条记录此刻还没有指向它，余次按库里现值派生（第 9.1 节）。
    const remaining = item.quantity - (await repositories.redemptions.countActiveByItem(item.id));
    if (remaining <= 0) {
      throw new PurchaseServiceError(`「${item.name}」已经没有剩余次数，请换一个套餐`);
    }
    if (
      item.expires_on !== null &&
      compareBusinessDates(usage.occurred_on, item.expires_on) > 0 &&
      !input.confirmedAfterExpiry
    ) {
      throw new PurchaseServiceError(
        `这次记录的日期 ${usage.occurred_on} 晚于这个套餐的有效期 ${item.expires_on}，请确认后再关联`,
      );
    }

    // 3. 只更新来源与来源快照。
    await writeSource(repositories, usage, {
      source_kind: SOURCE_KIND_BY_PURCHASE_KIND[item.purchase_kind],
      purchase_item_id: item.id,
      purchase_name_snapshot: item.purchase_name,
      purchase_item_name_snapshot: item.name,
      updated_at: now,
    });

    // 4. 写入后任何项目的余次都不得为负。
    if ((await repositories.redemptions.countActiveByItem(item.id)) > item.quantity) {
      throw new PurchaseServiceError(`「${item.name}」的剩余次数刚刚发生了变化，请重试`);
    }
    return { changed: true };
  });
}

async function writeSource(
  repositories: RepositoryBundle,
  usage: UsageRecordRow,
  columns: {
    readonly source_kind: UsageRecordRow['source_kind'];
    readonly purchase_item_id: string | null;
    readonly purchase_name_snapshot: string | null;
    readonly purchase_item_name_snapshot: string | null;
    readonly updated_at: string;
  },
): Promise<void> {
  const changes = await repositories.events.updateUsageSource({ id: usage.id, ...columns });
  if (changes !== 1) {
    // 读到时还有效、写时却没落上：状态已经变了，整笔回滚让用户重来。
    throw new PurchaseServiceError(USAGE_VOIDED_MESSAGE);
  }
}

/** 修正来源弹层的数据：这条记录可以关联的候选购买项目（兼容且有余次，不含当前项目）。 */
export async function listCorrectionCandidates(
  dataAccess: DataAccess,
  usageId: string,
): Promise<UsageSourceCandidate[]> {
  const usage = await dataAccess.events.findUsage(DEFAULT_PROFILE_ID, usageId);
  if (usage === null) {
    throw new PurchaseServiceError(USAGE_MISSING_MESSAGE);
  }
  const candidates = await listUsageSourceCandidates(dataAccess);
  return candidates.filter(
    (candidate) =>
      candidate.purchaseItemId !== usage.purchase_item_id &&
      isCompatibleTarget(usage, {
        category_code: candidate.identity.categoryCode,
        service_code: candidate.identity.serviceCode,
        custom_name: candidate.identity.customName,
      }),
  );
}
