import type { PurchaseDraft, PurchaseDraftInput } from '@/features/purchases/purchase-draft';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';

/**
 * 「新建套餐并使用」子步骤与记录表单之间的交接（BT-0023 裁决 2）。
 *
 * 子步骤是一个独立的全屏路由，复用新增套餐的两步表单；它**不写数据库**，只把校验通过的
 * 套餐草稿放在这里，回到记录表单后由记录表单取走，与变美记录在同一个事务里一起保存。
 * 取消子步骤不留下任何东西：记录表单离开时会清掉它发起的全部交接。
 *
 * 只存在于内存：App 被系统回收时记录表单本身也不在了，没有需要恢复的东西。
 * 键是新套餐预先生成的购买 ID，同一行反复打开子步骤用的是同一个键。
 *
 * 交接同时带着这一行的项目（BT-0023B）：新套餐里必须保留一个与它匹配的项目，子步骤才能确认返回。
 */

type HandoffEntry = {
  /** 发起交接的记录草稿，用于记录表单只取自己的结果 */
  readonly eventId: string;
  /** 这个新套餐挂在哪一行 */
  readonly lineKey: string;
  /** 打开子步骤时的初始草稿；再次修改时是上一次交回的草稿 */
  readonly initial: PurchaseDraft;
  /** 这一行的项目与显示名称；新套餐必须保留一个与它匹配的项目 */
  readonly requiredService: PurchaseItemIdentity;
  readonly requiredName: string;
  result: { readonly draft: PurchaseDraft; readonly input: PurchaseDraftInput } | null;
};

const entries = new Map<string, HandoffEntry>();

export function openPackageHandoff(
  purchaseId: string,
  entry: {
    readonly eventId: string;
    readonly lineKey: string;
    readonly initial: PurchaseDraft;
    readonly requiredService: PurchaseItemIdentity;
    readonly requiredName: string;
  },
): void {
  entries.set(purchaseId, { ...entry, result: null });
}

export type PackageHandoffRequest = {
  readonly initial: PurchaseDraft;
  readonly requiredService: PurchaseItemIdentity;
  readonly requiredName: string;
};

/** 子步骤读取初始草稿与必须保留的项目；交接已经失效（例如记录表单已经离开）时返回 null。 */
export function readPackageHandoff(purchaseId: string): PackageHandoffRequest | null {
  const entry = entries.get(purchaseId);
  return entry === undefined
    ? null
    : { initial: entry.initial, requiredService: entry.requiredService, requiredName: entry.requiredName };
}

/** 子步骤确认：放下校验通过的草稿。交接已失效时返回 false。 */
export function completePackageHandoff(
  purchaseId: string,
  draft: PurchaseDraft,
  input: PurchaseDraftInput,
): boolean {
  const entry = entries.get(purchaseId);
  if (entry === undefined) {
    return false;
  }
  entry.result = { draft, input };
  return true;
}

export type PackageHandoffResult = {
  readonly purchaseId: string;
  readonly lineKey: string;
  readonly draft: PurchaseDraft;
  readonly input: PurchaseDraftInput;
};

/** 记录表单取走属于自己的全部已确认结果；取走即删除。 */
export function takeCompletedPackages(eventId: string): PackageHandoffResult[] {
  const taken: PackageHandoffResult[] = [];
  for (const [purchaseId, entry] of entries) {
    if (entry.eventId === eventId && entry.result !== null) {
      taken.push({ purchaseId, lineKey: entry.lineKey, ...entry.result });
      entries.delete(purchaseId);
    }
  }
  return taken;
}

/** 记录表单离开时清掉自己发起的全部交接（含子步骤被取消的）。 */
export function discardPackageHandoffs(eventId: string): void {
  for (const [purchaseId, entry] of entries) {
    if (entry.eventId === eventId) {
      entries.delete(purchaseId);
    }
  }
}
