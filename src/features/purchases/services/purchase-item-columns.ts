import { PURCHASE_ITEM_CATEGORIES, type PurchaseItemCategory } from '@/db';

/**
 * schema v4 套餐项目列与现有表单之间的换算。
 *
 * 金额已经由两步式套餐表单（BT-0019C）直接按「项目分配金额」录入，写库时原样落到
 * `allocated_amount_minor`，这里不再做金额换算（ADR-023）。项目选择器属于 BT-0021B，
 * 在那之前表单仍然只有七个分类与一个自由文本名称，库里存的是 `category_code`、
 * `service_code` 与 `custom_name`（DATA_MODEL_V4 第 5 节）。这里是两套口径之间唯一的换算点。
 */

/** 表单认得的分类；库里出现目录之外的代码时（只可能来自备份）按「其他」展示。 */
export function toFormCategory(categoryCode: string): PurchaseItemCategory {
  return (PURCHASE_ITEM_CATEGORIES as readonly string[]).includes(categoryCode)
    ? (categoryCode as PurchaseItemCategory)
    : 'other';
}

/**
 * 详情页展示的「单次金额」。
 *
 * 分配总额是唯一事实，单价只是派生的展示值（ADR-023），不会被写回。
 */
export function displayUnitAmountMinor(allocatedAmountMinor: number, quantity: number): number {
  return quantity > 0 ? Math.round(allocatedAmountMinor / quantity) : 0;
}

type StoredItem = {
  readonly name: string;
  readonly category_code: string;
  readonly service_code: string | null;
  readonly custom_name: string | null;
};

type FormItem = {
  readonly name: string;
  readonly category: PurchaseItemCategory;
};

/**
 * 保存时写入的分类与项目标识三列。
 *
 * - 名称与分类都没变：三列原样保留，迁移时映射到目录的项目不会因为编辑了次数、
 *   金额或备注而丢掉目录代码，库里当前目录不认识的历史代码也原样保留。
 * - 只改了名称：现有表单只有一个自由文本的名称框，改名后只能当作自定义项目，
 *   清空目录代码、以新名称作为自定义名称；分类代码仍原样保留，不因改名被改写成「其他」。
 * - 改了分类：写入用户选的分类，它已经过 `assertPurchaseItemIsValid` 的严格校验。
 *
 * 已有使用记录上的快照都不受影响（第 5B.5 节）。
 */
export function resolveItemIdentity(
  stored: StoredItem | null,
  input: FormItem,
): { readonly category_code: string; readonly service_code: string | null; readonly custom_name: string | null } {
  const name = input.name.trim();
  const sameCategory = stored !== null && toFormCategory(stored.category_code) === input.category;
  if (sameCategory && stored.name === name) {
    return {
      category_code: stored.category_code,
      service_code: stored.service_code,
      custom_name: stored.custom_name,
    };
  }
  if (sameCategory) {
    return { category_code: stored.category_code, service_code: null, custom_name: name };
  }
  return { category_code: input.category, service_code: null, custom_name: name };
}
