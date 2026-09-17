import { type BusinessDate, type PurchaseItemCategory } from '@/db';
import { compareBusinessDates, isBusinessDate } from '@/utils/business-date';
import { MAX_AMOUNT_MINOR } from '@/utils/money';
import { PurchaseServiceError } from './errors';

/**
 * 新增与编辑套餐共用的 service 层字段规则。
 *
 * 只有一份：新增和编辑是同一套业务规则的两个入口，规则分成两份迟早会漂移
 * （任务书第四节）。表单层的 `purchase-draft` 负责把用户输入变成结构化数据并
 * 逐字段给出提示，这里负责在写库前再确认一次——service 才是规则的归属层，
 * 换一个调用方（导入、心愿单转购买）时这些约束仍然必须成立。
 *
 * 这里不校验「次数不得小于有效核销数」：那条规则需要读库，只能在事务内做，
 * 属于 `update-purchase`。
 */

/** 套餐自身的可编辑字段，新增与编辑完全相同。 */
export type PurchaseBasicsInput = {
  readonly name: string;
  readonly purchaseDate: BusinessDate;
  /** 套餐总价，整数分 */
  readonly totalAmountMinor: number;
  readonly expiresOn: BusinessDate | null;
};

/** 套餐项目的可编辑字段，新增与编辑完全相同。 */
export type PurchaseItemFields = {
  readonly name: string;
  readonly category: PurchaseItemCategory;
  /** 购买次数，正整数 */
  readonly quantity: number;
  /** 分摊单价，整数分，允许为 0（0 表示赠送项目，PRD 第 6.2 节） */
  readonly unitAmountMinor: number;
  readonly notes: string | null;
};

function assertValid(condition: boolean, message: string): void {
  if (!condition) {
    throw new PurchaseServiceError(message);
  }
}

/** 校验套餐自身字段：名称、日期关系与总价范围（PRD 第 6.4 节）。 */
export function assertPurchaseBasicsAreValid(input: PurchaseBasicsInput): void {
  assertValid(input.name.trim() !== '', '请填写套餐名称');
  assertValid(isBusinessDate(input.purchaseDate), '购买日期不是一个真实存在的日期');
  assertValid(
    input.expiresOn === null || isBusinessDate(input.expiresOn),
    '有效期不是一个真实存在的日期',
  );
  assertValid(
    input.expiresOn === null || compareBusinessDates(input.expiresOn, input.purchaseDate) >= 0,
    '有效期不能早于购买日期',
  );
  assertValid(
    Number.isSafeInteger(input.totalAmountMinor) &&
      input.totalAmountMinor >= 0 &&
      input.totalAmountMinor <= MAX_AMOUNT_MINOR,
    '套餐总价不在可保存的范围内',
  );
}

/** 校验单个项目的字段（PRD 第 6.2、6.4 节）。 */
export function assertPurchaseItemIsValid(item: PurchaseItemFields): void {
  assertValid(item.name.trim() !== '', '请填写项目名称');
  assertValid(Number.isInteger(item.quantity) && item.quantity > 0, '购买次数必须是大于 0 的整数');
  assertValid(
    Number.isSafeInteger(item.unitAmountMinor) &&
      item.unitAmountMinor >= 0 &&
      item.unitAmountMinor <= MAX_AMOUNT_MINOR,
    '单次金额不在可保存的范围内',
  );
}

/** 一个套餐至少要留一个项目（PRD-PUR-003）。编辑时同样成立，不能删到一个不剩。 */
export function assertHasAtLeastOneItem(itemCount: number): void {
  assertValid(itemCount > 0, '至少添加一个项目');
}

/** 城市统一清洗：去首尾空格，空串一律当作未填写，避免库里出现 `''` 与 `null` 两种空。 */
export function normalizeCity(city: string | null): string | null {
  if (city === null) {
    return null;
  }
  const trimmed = city.trim();
  return trimmed === '' ? null : trimmed;
}
