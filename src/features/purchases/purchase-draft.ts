import type { PurchaseItemCategory } from '@/db';
import { compareBusinessDates, parseBusinessDate } from '@/utils/business-date';
import { cleanInstitutionName } from '@/utils/institution-name';
import { formatMinorForInput, parseYuanToMinor } from '@/utils/money';
import { parseQuantity } from '@/utils/quantity';
import type {
  CreatePurchaseInput,
  CreatePurchaseItemInput,
  InstitutionSelection,
} from './services/create-purchase';
import type { PurchaseEditModel } from './services/get-purchase-for-edit';

/**
 * 套餐表单的草稿模型与校验，新增与编辑共用同一份。
 *
 * 这里是**纯函数**：不碰 React、不碰数据库、不碰导航。
 * 草稿里的每个字段都是用户原样输入的字符串，只有通过 `validatePurchaseDraft`
 * 才会变成带整数分与业务日期的结构化输入。
 *
 * 两个流程共用一份的原因很直接：套餐名称必填、金额两位小数、有效期不得早于购买日期
 * 这些规则在新增和编辑时字字相同，抄成两份迟早会各改各的（任务书第四节）。
 */

/** 机构的选择状态。`query` 同时承担搜索关键词与新机构名称两个角色。 */
export type InstitutionDraftMode = 'none' | 'existing' | 'new';

export type PurchaseItemDraft = {
  /** 仅用于 React key 与错误映射，不入库 */
  readonly key: string;
  /** 既有项目的 ID；null 表示这一行是本次新增的项目 */
  readonly purchaseItemId: string | null;
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

/**
 * 校验通过后的项目：在 `CreatePurchaseItemInput` 之上多带一个 `purchaseItemId`。
 *
 * 新增流程不看这一列（那时它恒为 null），编辑流程靠它把每一行对回原来的项目。
 */
export type PurchaseDraftItemInput = CreatePurchaseItemInput & {
  readonly purchaseItemId: string | null;
};

/** 校验通过后的整份输入。结构上仍然可以直接交给 `createPurchase`。 */
export type PurchaseDraftInput = Omit<CreatePurchaseInput, 'items'> & {
  readonly items: readonly PurchaseDraftItemInput[];
};

export type PurchaseDraftValidation =
  | { readonly ok: true; readonly input: PurchaseDraftInput }
  | { readonly ok: false; readonly errors: PurchaseFormErrors };

/** 校验时的附加约束，新增流程不需要传。 */
export type PurchaseDraftValidationOptions = {
  /**
   * 以项目草稿的 `key` 为索引的购买次数下限，即该项目当前的有效核销次数。
   *
   * 这是两层次数安全校验的第一层，作用是让用户在按下保存**之前**就看到原因
   * （PRD-PUR-008、E-06）。第二层在 `updatePurchase` 的事务里，那一层才是最终裁决。
   */
  readonly minQuantityByKey?: Readonly<Record<string, number>>;
};

export function createEmptyItemDraft(key: string): PurchaseItemDraft {
  return {
    key,
    purchaseItemId: null,
    name: '',
    category: null,
    quantity: '',
    unitAmount: '',
    notes: '',
  };
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

/**
 * 从库里读到的套餐生成编辑草稿。
 *
 * 初值全部来自真实数据，没有任何默认值兜底（任务书第五节第 1 条）：
 * 购买日期不会退回今天，机构不会退回空，金额也不会被重新格式化成带符号的展示文本。
 *
 * 项目草稿的 `key` 直接用项目 ID：它天然唯一且稳定，重新渲染时不会错位。
 * 本次新增的行没有 ID，由调用方另发一个不会与之相撞的 key。
 */
export function createDraftFromEdit(model: PurchaseEditModel): PurchaseDraft {
  return {
    name: model.name,
    // 机构 ID 还在就按「已选中」呈现；只剩快照名说明这条记录的机构已经不在可选列表里，
    // 此时把快照名放进输入框当作一个待确认的新机构名，不假装用户什么都没填过。
    institutionMode:
      model.institutionId !== null ? 'existing' : model.institutionName !== null ? 'new' : 'none',
    institutionId: model.institutionId,
    institutionQuery: model.institutionName ?? '',
    city: model.city ?? '',
    purchaseDate: model.purchaseDate,
    totalAmount: formatMinorForInput(model.totalAmountMinor),
    expiresOn: model.expiresOn ?? '',
    notes: model.notes ?? '',
    items: model.items.map((item) => ({
      key: item.id,
      purchaseItemId: item.id,
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unitAmount: formatMinorForInput(item.unitAmountMinor),
      notes: item.notes ?? '',
    })),
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
export function validatePurchaseDraft(
  draft: PurchaseDraft,
  options: PurchaseDraftValidationOptions = {},
): PurchaseDraftValidation {
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

  const items: PurchaseDraftItemInput[] = [];
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
    } else {
      // 次数不得少于已核销次数。只有编辑流程会传这个下限；
      // 提示里同时给出当前已核销次数与最小可填值，用户不用自己推算（E-06）。
      const minQuantity = options.minQuantityByKey?.[item.key];
      if (minQuantity !== undefined && quantity.quantity < minQuantity) {
        errors.quantity = `已核销 ${minQuantity} 次，购买次数不能少于 ${minQuantity}`;
      }
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
        purchaseItemId: item.purchaseItemId,
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

function isSameItem(item: PurchaseItemDraft, initial: PurchaseItemDraft): boolean {
  return (
    item.purchaseItemId === initial.purchaseItemId &&
    item.name === initial.name &&
    item.category === initial.category &&
    item.quantity === initial.quantity &&
    item.unitAmount === initial.unitAmount &&
    item.notes === initial.notes
  );
}

/**
 * 草稿相对初始状态是否已有改动。
 *
 * 用来决定返回时要不要弹放弃确认（IA 第 4.3 节第 4 条）。
 * 逐字段与初始草稿比较，而不是判断「是否非空」：新增时购买日期默认今天、
 * 编辑时所有字段一打开就都有值，按非空判断会让「什么都没改就返回」也弹确认
 * （任务书第五节第 8 条）。
 *
 * 只比较用户能改的内容，不比较 `key`：新增一行再删掉，草稿应当算回未修改。
 */
export function isDraftDirty(draft: PurchaseDraft, initial: PurchaseDraft): boolean {
  if (
    draft.name !== initial.name ||
    draft.institutionMode !== initial.institutionMode ||
    draft.institutionId !== initial.institutionId ||
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
  return draft.items.some((item, index) => {
    const initialItem = initial.items[index];
    return initialItem === undefined || !isSameItem(item, initialItem);
  });
}
