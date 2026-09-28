import {
  DEFAULT_CURRENCY,
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemRow,
} from '@/db';
import { createUuid } from '@/utils/uuid';
import { resolveInstitution, type InstitutionSelection } from './institution-selection';
import {
  assertHasAtLeastOneItem,
  assertPurchaseBasicsAreValid,
  assertPurchaseItemIsValid,
  normalizeCity,
  type PurchaseItemFields,
} from './purchase-input-rules';
import { resolveItemIdentity } from './purchase-item-columns';
import { allocationSaveRejectedMessage, checkAllocationSave } from './purchase-allocation';
import { PurchaseServiceError } from './errors';
import { resolvePurchaser } from './purchaser-selection';

/**
 * 新增套餐用例。
 *
 * 一次调用完成「创建或复用机构 + 确认购买人 + 创建套餐 + 创建全部项目」，整体在一个事务里，
 * 任意一步失败全部回滚，不会留下半个套餐（ARCHITECTURE 第三节、任务书第七节）。
 */

// 机构选择的类型与解析规则由 `institution-selection` 统一提供，核销共用同一份。
// 这里继续导出类型，是为了不让表单层关心它具体来自哪个文件。
export type { InstitutionSelection };

/** 字段定义与编辑流程共用，见 `purchase-input-rules`。 */
export type CreatePurchaseItemInput = PurchaseItemFields;

export type CreatePurchaseInput = {
  readonly name: string;
  /** 购买人。表单默认「自己」；service 在事务内重新校验 */
  readonly purchaserPersonId: string;
  readonly institution: InstitutionSelection;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  /** 套餐总价，整数分 */
  readonly totalAmountMinor: number;
  readonly expiresOn: BusinessDate | null;
  readonly notes: string | null;
  readonly items: readonly CreatePurchaseItemInput[];
};

/**
 * 入参兜底校验。
 *
 * 表单已经校验过一遍，这里再校验一遍不是重复劳动：service 是业务规则的归属层，
 * 换一个调用方（导入、心愿单转购买）时这些规则仍然必须成立。
 */
function assertInputIsValid(input: CreatePurchaseInput): void {
  assertPurchaseBasicsAreValid(input);
  assertHasAtLeastOneItem(input.items.length);

  for (const item of input.items) {
    assertPurchaseItemIsValid(item);
  }

  // 新建套餐的分配合计必须恰好等于总价，差 1 分也不保存（PRD-ALLOC-002）。
  const check = checkAllocationSave(null, {
    totalMinor: input.totalAmountMinor,
    items: input.items.map((item) => ({
      id: null,
      quantity: item.quantity,
      allocatedMinor: item.allocatedAmountMinor,
    })),
  });
  if (!check.ok) {
    throw new PurchaseServiceError(allocationSaveRejectedMessage(check));
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
  const city = normalizeCity(input.city);

  return dataAccess.transaction(async (repositories) => {
    const institution = await resolveInstitution(repositories, input.institution, city, now);
    // 购买人在事务内重新确认：同一档案、存在且使用中（PRD 第 5B.4 节）。
    const purchaser = await resolvePurchaser(repositories, input.purchaserPersonId, null);
    const purchaseId = createUuid();

    await repositories.purchases.insert({
      id: purchaseId,
      profile_id: DEFAULT_PROFILE_ID,
      // 现有表单只录入套餐；「单次」购买只由「记录一次变美」生成（BT-0023）。
      purchase_kind: 'package',
      purchaser_person_id: purchaser.personId,
      purchaser_name_snapshot: purchaser.nameSnapshot,
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

    // 分配金额原样写入；名称仍是自由文本，分类与项目标识的换算集中在 purchase-item-columns。
    const items: PurchaseItemRow[] = input.items.map((item) => ({
      id: createUuid(),
      purchase_id: purchaseId,
      name: item.name.trim(),
      ...resolveItemIdentity(null, item),
      quantity: item.quantity,
      allocated_amount_minor: item.allocatedAmountMinor,
      notes: item.notes,
      created_at: now,
      updated_at: now,
    }));
    await repositories.purchases.insertItems(items);

    return purchaseId;
  });
}
