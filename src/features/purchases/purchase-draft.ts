import type { PurchaseItemCategory } from '@/db';
import { compareBusinessDates, parseBusinessDate } from '@/utils/business-date';
import { cleanInstitutionName } from '@/utils/institution-name';
import { parseYuanToMinor } from '@/utils/money';
import { parseQuantity } from '@/utils/quantity';
import type {
  CreatePurchaseInput,
  CreatePurchaseItemInput,
  InstitutionSelection,
} from './services/create-purchase';

/**
 * 新增套餐表单的草稿模型与校验。
 *
 * 这里是**纯函数**：不碰 React、不碰数据库、不碰导航。
 * 草稿里的每个字段都是用户原样输入的字符串，只有通过 `validatePurchaseDraft`
 * 才会变成带整数分与业务日期的 `CreatePurchaseInput`。
 */

/** 机构的选择状态。`query` 同时承担搜索关键词与新机构名称两个角色。 */
export type InstitutionDraftMode = 'none' | 'existing' | 'new';

export type PurchaseItemDraft = {
  /** 仅用于 React key 与错误映射，不入库 */
  readonly key: string;
  readonly name: string;
  readonly category: PurchaseItemCategory | null;
  readonly quantity: string;
  readonly unitAmount: string;
  readonly notes: string;
};

export type PurchaseDraft = {
  readonly name: string;
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  readonly city: string;
  readonly purchaseDate: string;
  readonly totalAmount: string;
  readonly expiresOn: string;
  readonly notes: string;
  readonly items: readonly PurchaseItemDraft[];
};

export type PurchaseItemErrors = {
  readonly name?: string;
  readonly category?: string;
  readonly quantity?: string;
  readonly unitAmount?: string;
};

export type PurchaseFormErrors = {
  readonly name?: string;
  readonly institution?: string;
  readonly purchaseDate?: string;
  readonly totalAmount?: string;
  readonly expiresOn?: string;
  /** 以项目草稿的 `key` 为索引 */
  readonly items: Readonly<Record<string, PurchaseItemErrors>>;
};

export type PurchaseDraftValidation =
  | { readonly ok: true; readonly input: CreatePurchaseInput }
  | { readonly ok: false; readonly errors: PurchaseFormErrors };

export function createEmptyItemDraft(key: string): PurchaseItemDraft {
  return { key, name: '', category: null, quantity: '', unitAmount: '', notes: '' };
}

/** 初始草稿：购买日期默认今天，项目区默认给出一行空项目（IA 第 3.6.1 节）。 */
export function createInitialDraft(today: string, firstItemKey: string): PurchaseDraft {
  return {
    name: '',
    institutionMode: 'none',
    institutionId: null,
    institutionQuery: '',
    city: '',
    purchaseDate: today,
    totalAmount: '',
    expiresOn: '',
    notes: '',
    items: [createEmptyItemDraft(firstItemKey)],
  };
}

const AMOUNT_MESSAGES = {
  empty: '请填写金额',
  not_a_number: '只能填写数字，例如 1280 或 1280.00',
  negative: '金额不能为负数',
  too_many_decimals: '最多保留两位小数',
  out_of_range: '金额过大，请检查是否输入有误',
} as const;

const DATE_MESSAGES = {
  empty: '请填写日期',
  malformed: '请按 YYYY-MM-DD 填写，例如 2026-09-15',
  not_a_real_date: '这一天在日历上不存在，请检查月份与日期',
  out_of_range: '年份超出可填写范围',
} as const;

const QUANTITY_MESSAGES = {
  empty: '请填写购买次数',
  not_an_integer: '购买次数只能是整数',
  not_positive: '购买次数必须大于 0',
  out_of_range: '购买次数过大，请检查是否输入有误',
} as const;

function toInstitutionSelection(draft: PurchaseDraft): InstitutionSelection {
  if (draft.institutionMode === 'existing' && draft.institutionId !== null) {
    return { kind: 'existing', institutionId: draft.institutionId };
  }
  if (draft.institutionMode === 'new') {
    return { kind: 'new', name: cleanInstitutionName(draft.institutionQuery) };
  }
  return { kind: 'none' };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function hasAnyError(errors: PurchaseFormErrors): boolean {
  const { items, ...topLevel } = errors;
  if (Object.values(topLevel).some((message) => message !== undefined)) {
    return true;
  }
  return Object.values(items).some((itemErrors) => Object.keys(itemErrors).length > 0);
}

/**
 * 校验整份草稿。
 *
 * 一次性收集**全部**字段的错误再返回，不在第一个错误处短路：
 * 用户应该一次看到所有需要修改的地方，而不是改一个冒一个。
 */
export function validatePurchaseDraft(draft: PurchaseDraft): PurchaseDraftValidation {
  const itemErrors: Record<string, PurchaseItemErrors> = {};
  let nameError: string | undefined;
  let institutionError: string | undefined;
  let purchaseDateError: string | undefined;
  let totalAmountError: string | undefined;
  let expiresOnError: string | undefined;

  if (draft.name.trim() === '') {
    nameError = '请填写套餐名称';
  }

  const selection = toInstitutionSelection(draft);
  if (selection.kind === 'new' && selection.name === '') {
    institutionError = '机构名称不能只有空格';
  }

  const purchaseDate = parseBusinessDate(draft.purchaseDate);
  if (!purchaseDate.ok) {
    purchaseDateError =
      purchaseDate.reason === 'empty' ? '请填写购买日期' : DATE_MESSAGES[purchaseDate.reason];
  }

  const totalAmount = parseYuanToMinor(draft.totalAmount);
  if (!totalAmount.ok) {
    totalAmountError =
      totalAmount.reason === 'empty' ? '请填写套餐总价' : AMOUNT_MESSAGES[totalAmount.reason];
  }

  // 有效期可以留空，留空表示未知或长期有效（PRD E-10）。
  let expiresOn: string | null = null;
  if (draft.expiresOn.trim() !== '') {
    const parsed = parseBusinessDate(draft.expiresOn);
    if (!parsed.ok) {
      expiresOnError = DATE_MESSAGES[parsed.reason];
    } else {
      expiresOn = parsed.value;
      if (purchaseDate.ok && compareBusinessDates(parsed.value, purchaseDate.value) < 0) {
        expiresOnError = '有效期不能早于购买日期';
      }
    }
  }

  const items: CreatePurchaseItemInput[] = [];
  for (const item of draft.items) {
    const errors: {
      name?: string;
      category?: string;
      quantity?: string;
      unitAmount?: string;
    } = {};

    if (item.name.trim() === '') {
      errors.name = '请填写项目名称';
    }
    if (item.category === null) {
      errors.category = '请选择项目分类';
    }

    const quantity = parseQuantity(item.quantity);
    if (!quantity.ok) {
      errors.quantity = QUANTITY_MESSAGES[quantity.reason];
    }

    // 单次金额必填，允许填 0 表示赠送项目（PRD 第 6.2 节、PRD-PUR-011）。
    const unitAmount = parseYuanToMinor(item.unitAmount);
    if (!unitAmount.ok) {
      errors.unitAmount =
        unitAmount.reason === 'empty' ? '请填写单次金额，赠送项目填 0' : AMOUNT_MESSAGES[unitAmount.reason];
    }

    if (Object.keys(errors).length > 0) {
      itemErrors[item.key] = errors;
      continue;
    }
    if (item.category !== null && quantity.ok && unitAmount.ok) {
      items.push({
        name: item.name.trim(),
        category: item.category,
        quantity: quantity.quantity,
        unitAmountMinor: unitAmount.minor,
        notes: optionalText(item.notes),
      });
    }
  }

  const errors: PurchaseFormErrors = {
    name: nameError,
    institution: institutionError,
    purchaseDate: purchaseDateError,
    totalAmount: totalAmountError,
    expiresOn: expiresOnError,
    items: itemErrors,
  };

  if (hasAnyError(errors) || !purchaseDate.ok || !totalAmount.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      name: draft.name.trim(),
      institution: selection,
      city: optionalText(draft.city),
      purchaseDate: purchaseDate.value,
      totalAmountMinor: totalAmount.minor,
      expiresOn,
      notes: optionalText(draft.notes),
      items,
    },
  };
}

/**
 * 项目分摊总额 = Σ(单次金额 × 购买次数)，整数分。
 *
 * 只累加当前能解析出合法数值的行；有行还没填完时返回 null，
 * 避免用半份数据算出一个会误导人的差额。
 */
export function allocatedTotalMinor(draft: PurchaseDraft): number | null {
  let total = 0;
  for (const item of draft.items) {
    const quantity = parseQuantity(item.quantity);
    const unitAmount = parseYuanToMinor(item.unitAmount);
    if (!quantity.ok || !unitAmount.ok) {
      return null;
    }
    total += unitAmount.minor * quantity.quantity;
  }
  return total;
}

function isItemPristine(item: PurchaseItemDraft): boolean {
  return (
    item.name === '' &&
    item.category === null &&
    item.quantity === '' &&
    item.unitAmount === '' &&
    item.notes === ''
  );
}

/**
 * 草稿相对初始状态是否已有内容。
 *
 * 用来决定返回时要不要弹放弃确认（IA 第 4.3 节第 4 条）。
 * 购买日期默认是今天，用户没动它不算改动，所以按「与初始草稿是否相同」判断，
 * 而不是按「是否非空」。
 */
export function isDraftDirty(draft: PurchaseDraft, initial: PurchaseDraft): boolean {
  if (
    draft.name !== initial.name ||
    draft.institutionMode !== initial.institutionMode ||
    draft.institutionQuery !== initial.institutionQuery ||
    draft.city !== initial.city ||
    draft.purchaseDate !== initial.purchaseDate ||
    draft.totalAmount !== initial.totalAmount ||
    draft.expiresOn !== initial.expiresOn ||
    draft.notes !== initial.notes
  ) {
    return true;
  }
  if (draft.items.length !== initial.items.length) {
    return true;
  }
  return draft.items.some((item) => !isItemPristine(item));
}
