import {
  DEFAULT_CURRENCY,
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemCategory,
  type PurchaseItemRow,
} from '@/db';
import { compareBusinessDates, isBusinessDate } from '@/utils/business-date';
import { MAX_AMOUNT_MINOR } from '@/utils/money';
import { createUuid } from '@/utils/uuid';
import { PurchaseServiceError } from './errors';
import { resolveInstitution, type InstitutionSelection } from './institution-selection';

/**
 * 新增套餐用例。
 *
 * 一次调用完成「创建或复用机构 + 创建套餐 + 创建全部项目」，整体在一个事务里，
 * 任意一步失败全部回滚，不会留下半个套餐（ARCHITECTURE 第三节、任务书第七节）。
 */

// 机构选择的类型与解析规则由 `institution-selection` 统一提供，核销共用同一份。
// 这里继续导出类型，是为了不让表单层关心它具体来自哪个文件。
export type { InstitutionSelection };

export type CreatePurchaseItemInput = {
  readonly name: string;
  readonly category: PurchaseItemCategory;
  /** 购买次数，正整数 */
  readonly quantity: number;
  /** 分摊单价，整数分，允许为 0（0 表示赠送项目，PRD 第 6.2 节） */
  readonly unitAmountMinor: number;
  readonly notes: string | null;
};

export type CreatePurchaseInput = {
  readonly name: string;
  readonly institution: InstitutionSelection;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  /** 套餐总价，整数分 */
  readonly totalAmountMinor: number;
  readonly expiresOn: BusinessDate | null;
  readonly notes: string | null;
  readonly items: readonly CreatePurchaseItemInput[];
};

function assertValid(condition: boolean, message: string): void {
  if (!condition) {
    throw new PurchaseServiceError(message);
  }
}

/**
 * 入参兜底校验。
 *
 * 表单已经校验过一遍，这里再校验一遍不是重复劳动：service 是业务规则的归属层，
 * 换一个调用方（导入、心愿单转购买）时这些规则仍然必须成立。
 */
function assertInputIsValid(input: CreatePurchaseInput): void {
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
  assertValid(input.items.length > 0, '至少添加一个项目');

  for (const item of input.items) {
    assertValid(item.name.trim() !== '', '请填写项目名称');
    assertValid(Number.isInteger(item.quantity) && item.quantity > 0, '购买次数必须是大于 0 的整数');
    assertValid(
      Number.isSafeInteger(item.unitAmountMinor) &&
        item.unitAmountMinor >= 0 &&
        item.unitAmountMinor <= MAX_AMOUNT_MINOR,
      '单次金额不在可保存的范围内',
    );
  }
}

/**
 * 创建一个套餐及其全部项目，返回新套餐的 ID。
 *
 * 失败时抛 `PurchaseServiceError`（业务原因，文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。
 */
export async function createPurchase(
  dataAccess: DataAccess,
  input: CreatePurchaseInput,
): Promise<string> {
  assertInputIsValid(input);

  const now = new Date().toISOString();
  const city = input.city === null || input.city.trim() === '' ? null : input.city.trim();

  return dataAccess.transaction(async (repositories) => {
    const institution = await resolveInstitution(repositories, input.institution, city, now);
    const purchaseId = createUuid();

    await repositories.purchases.insert({
      id: purchaseId,
      profile_id: DEFAULT_PROFILE_ID,
      institution_id: institution?.id ?? null,
      // 快照在录入当时固化，机构日后改名也不会让旧记录跟着变（PRD-INST-005）。
      institution_name_snapshot: institution?.name ?? null,
      city_snapshot: city ?? institution?.city ?? null,
      name: input.name.trim(),
      purchase_date: input.purchaseDate,
      total_amount_minor: input.totalAmountMinor,
      // 第一版交互只使用 CNY（PRD 第 20.1 节 Q-11），界面不提供币种选择。
      currency: DEFAULT_CURRENCY,
      expires_on: input.expiresOn,
      notes: input.notes,
      created_at: now,
      updated_at: now,
    });

    const items: PurchaseItemRow[] = input.items.map((item) => ({
      id: createUuid(),
      purchase_id: purchaseId,
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmountMinor,
      notes: item.notes,
      created_at: now,
      updated_at: now,
    }));
    await repositories.purchases.insertItems(items);

    return purchaseId;
  });
}
