import { PURCHASE_ITEM_CATEGORIES, type PurchaseItemCategory } from '@/db';

/**
 * schema v4 套餐项目列与现有表单之间的换算。
 *
 * 两步式套餐表单与项目选择器分别属于 BT-0019C 与 BT-0021B，本轮不做。
 * 在那之前现有表单仍然按「分摊单价 × 次数」和七个分类录入，库里存的是
 * `allocated_amount_minor`、`category_code`、`service_code` 与 `custom_name`
 * （DATA_MODEL_V4 第 5 节、ADR-023）。这里是两套口径之间唯一的换算点。
 */

/** 表单认得的分类；库里出现目录之外的代码时（只可能来自备份）按「其他」展示。 */
export function toFormCategory(categoryCode: string): PurchaseItemCategory {
  return (PURCHASE_ITEM_CATEGORIES as readonly string[]).includes(categoryCode)
    ? (categoryCode as PurchaseItemCategory)
    : 'other';
}

/**
 * 表单与详情页展示的「分摊单价」。
 *
 * 分配总额是唯一事实，单价只是派生的展示值（ADR-023）。v3 迁移来的数据都是
 * `单价 × 次数`，一定能整除；除不尽只可能来自 v2 备份，此时四舍五入到分，
 * 由 `resolveAllocatedAmount` 保证不会因此被写回。
 */
export function displayUnitAmountMinor(allocatedAmountMinor: number, quantity: number): number {
  return quantity > 0 ? Math.round(allocatedAmountMinor / quantity) : 0;
}

type StoredItem = {
  readonly name: string;
  readonly category_code: string;
  readonly service_code: string | null;
  readonly custom_name: string | null;
  readonly quantity: number;
  readonly allocated_amount_minor: number;
};

type FormItem = {
  readonly name: string;
  readonly category: PurchaseItemCategory;
  readonly quantity: number;
  readonly unitAmountMinor: number;
};

/**
 * 保存时写入的分配总额。
 *
 * 次数与展示单价都没被改动时，原样保留库里的分配总额：否则一个除不尽的历史金额
 * 会在「只改了备注」时被悄悄改写（第 5B.6 节：App 不自动修改任何金额）。
 * 改过其中任何一个，才按表单的「单价 × 次数」重新计算。
 */
export function resolveAllocatedAmount(stored: StoredItem | null, input: FormItem): number {
  if (
    stored !== null &&
    input.quantity === stored.quantity &&
    input.unitAmountMinor === displayUnitAmountMinor(stored.allocated_amount_minor, stored.quantity)
  ) {
    return stored.allocated_amount_minor;
  }
  return input.unitAmountMinor * input.quantity;
}

/**
 * 保存时写入的分类与项目标识三列。
 *
 * 名称与分类都没变时原样保留，迁移时映射到目录的项目不会因为编辑了次数或备注
 * 而丢掉目录代码。现有表单只有一个自由文本的名称框，改了名称或分类就只能当作
 * 自定义项目保存：清空目录代码、以名称作为自定义名称。已有使用记录上的快照不受影响
 * （第 5B.5 节）。
 */
export function resolveItemIdentity(
  stored: StoredItem | null,
  input: FormItem,
): { readonly category_code: string; readonly service_code: string | null; readonly custom_name: string | null } {
  const name = input.name.trim();
  if (stored !== null && stored.name === name && toFormCategory(stored.category_code) === input.category) {
    return {
      category_code: stored.category_code,
      service_code: stored.service_code,
      custom_name: stored.custom_name,
    };
  }
  return { category_code: input.category, service_code: null, custom_name: name };
}
