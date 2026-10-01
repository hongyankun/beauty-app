import type { BusinessDate } from '@/db';
import { compareBusinessDates, isBusinessDate } from '@/utils/business-date';
import { MAX_AMOUNT_MINOR } from '@/utils/money';
import { PurchaseServiceError } from './errors';
import type { PurchaseItemIdentity } from './purchase-item-columns';

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
  /** 套餐项目当前的显示名称，可以单独修改，不是项目身份 */
  readonly name: string;
  /** 做了什么项目：分类、目录代码与自定义名称三列（BT-0021B） */
  readonly service: PurchaseItemIdentity;
  /** 购买次数，正整数 */
  readonly quantity: number;
  /** 分配到这个项目的总金额，整数分，允许为 0（赠送项目，PRD 第 5B.6 节）；单次均价只是派生展示值 */
  readonly allocatedAmountMinor: number;
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

const IDENTITY_KEYS = ['categoryCode', 'customName', 'serviceCode'] as const;

function isIdentityShape(value: unknown): value is PurchaseItemIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== IDENTITY_KEYS.length || keys.some((key, index) => key !== IDENTITY_KEYS[index])) {
    return false;
  }
  const candidate = value as Record<(typeof IDENTITY_KEYS)[number], unknown>;
  return (
    typeof candidate.categoryCode === 'string' &&
    candidate.categoryCode !== '' &&
    (candidate.serviceCode === null || typeof candidate.serviceCode === 'string') &&
    (candidate.customName === null || typeof candidate.customName === 'string') &&
    (candidate.serviceCode !== null || candidate.customName !== null)
  );
}

/** 校验单个项目的字段（PRD 第 6.2、6.4 节）。 */
export function assertPurchaseItemIsValid(item: PurchaseItemFields): void {
  assertValid(item.name.trim() !== '', '请填写项目名称');
  // 这里只看结构：三列的类型对不对、字段多不多。是否属于当前目录要看库里原来存的是什么——
  // 没改动的历史值原样保留，改动过的才严格校验——那一步在 `resolveItemIdentity`。
  assertValid(isIdentityShape(item.service), '请选择项目');
  assertValid(Number.isInteger(item.quantity) && item.quantity > 0, '购买次数必须是大于 0 的整数');
  assertValid(
    Number.isSafeInteger(item.allocatedAmountMinor) &&
      item.allocatedAmountMinor >= 0 &&
      item.allocatedAmountMinor <= MAX_AMOUNT_MINOR,
    '项目分配金额不在可保存的范围内',
  );
}

/** 一个套餐至少要留一个项目（PRD-PUR-003）。编辑时同样成立，不能删到一个不剩。 */
export function assertHasAtLeastOneItem(itemCount: number): void {
  assertValid(itemCount > 0, '至少添加一个项目');
}

/**
 * 套餐的城市快照：取所选机构此刻的城市文字（PRD 第 5B.9 节，BT-0019B2）。
 * 没有机构或城市为空白时为 null，避免库里出现 `''` 与 `null` 两种空。
 */
export function cityOf(institution: { readonly city: string | null } | null): string | null {
  const city = institution?.city?.trim() ?? '';
  return city === '' ? null : city;
}
