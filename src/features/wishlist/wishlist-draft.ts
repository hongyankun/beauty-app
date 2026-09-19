import type { PurchaseItemCategory } from '@/db';
import { parseBusinessDate } from '@/utils/business-date';
import { formatMinorForInput, parseYuanToMinor } from '@/utils/money';

/**
 * 心愿表单的草稿模型与校验，新增与编辑共用同一份。
 *
 * 这里是**纯函数**：不碰 React、不碰数据库、不碰导航。
 * 草稿里的每个字段都是用户原样输入的字符串，只有通过 `validateWishlistDraft`
 * 才会变成带整数分与业务日期的结构化输入。
 *
 * 两个流程共用一份的原因与套餐表单一致：名称必填、预算两位小数、
 * 计划日期必须真实存在，这些规则在新增与编辑时字字相同，抄成两份迟早各改各的。
 */

export type WishlistDraft = {
  readonly name: string;
  readonly category: PurchaseItemCategory | null;
  /** 只能引用已有机构；null 表示没填 */
  readonly institutionId: string | null;
  readonly plannedOn: string;
  readonly budget: string;
  readonly notes: string;
};

export type WishlistFormErrors = {
  readonly name?: string;
  readonly plannedOn?: string;
  readonly budget?: string;
};

/** 校验通过后的结构化输入，可直接交给 service。 */
export type WishlistDraftInput = {
  readonly name: string;
  readonly category: PurchaseItemCategory | null;
  readonly institutionId: string | null;
  readonly plannedOn: string | null;
  /** 整数分；null 表示没填 */
  readonly budgetMinor: number | null;
  readonly notes: string | null;
};

export type WishlistDraftValidation =
  | { readonly ok: true; readonly input: WishlistDraftInput }
  | { readonly ok: false; readonly errors: WishlistFormErrors };

const AMOUNT_MESSAGES = {
  empty: '请填写预算',
  not_a_number: '只能填写数字，例如 3000 或 3000.00',
  negative: '预算不能为负数',
  too_many_decimals: '最多保留两位小数',
  out_of_range: '金额过大，请检查是否输入有误',
} as const;

const DATE_MESSAGES = {
  empty: '请填写日期',
  malformed: '请按 YYYY-MM-DD 填写，例如 2026-09-15',
  not_a_real_date: '这一天在日历上不存在，请检查月份与日期',
  out_of_range: '年份超出可填写范围',
} as const;

/** 新增时的初始草稿：全部为空，不预填任何默认值。 */
export function createEmptyWishlistDraft(): WishlistDraft {
  return {
    name: '',
    category: null,
    institutionId: null,
    plannedOn: '',
    budget: '',
    notes: '',
  };
}

/** 已有心愿的字段，供编辑草稿取初值。 */
export type WishlistDraftSource = {
  readonly name: string;
  readonly category: PurchaseItemCategory | null;
  readonly institutionId: string | null;
  readonly plannedOn: string | null;
  readonly budgetMinor: number | null;
  readonly notes: string | null;
};

/**
 * 从已有心愿生成编辑草稿。
 *
 * 初值全部来自真实数据，没有任何默认值兜底：计划日期不会退回今天，
 * 预算不会被格式化成带货币符号的展示文本（那样会校验不过）。
 */
export function createWishlistDraftFrom(source: WishlistDraftSource): WishlistDraft {
  return {
    name: source.name,
    category: source.category,
    institutionId: source.institutionId,
    plannedOn: source.plannedOn ?? '',
    budget: source.budgetMinor === null ? '' : formatMinorForInput(source.budgetMinor),
    notes: source.notes ?? '',
  };
}

/** 空的选填文本统一落成 NULL，不往库里写无意义的空字符串。 */
function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 校验整份草稿。
 *
 * 一次性收集**全部**字段的错误再返回，不在第一个错误处短路：
 * 用户应该一次看到所有需要修改的地方，而不是改一个冒一个。
 */
export function validateWishlistDraft(draft: WishlistDraft): WishlistDraftValidation {
  let nameError: string | undefined;
  let plannedOnError: string | undefined;
  let budgetError: string | undefined;

  const name = draft.name.trim();
  if (name === '') {
    nameError = '请填写心愿名称';
  }

  // 计划日期选填。填了就必须是日历上真实存在的一天，但允许早于今天：
  // 用户可能记的是「本来打算三月去」这种已经过去的计划。
  let plannedOn: string | null = null;
  if (draft.plannedOn.trim() !== '') {
    const parsed = parseBusinessDate(draft.plannedOn);
    if (!parsed.ok) {
      plannedOnError = DATE_MESSAGES[parsed.reason];
    } else {
      plannedOn = parsed.value;
    }
  }

  // 预算选填。填了就必须是合法的非负金额，允许填 0。
  let budgetMinor: number | null = null;
  if (draft.budget.trim() !== '') {
    const parsed = parseYuanToMinor(draft.budget);
    if (!parsed.ok) {
      budgetError = AMOUNT_MESSAGES[parsed.reason];
    } else {
      budgetMinor = parsed.minor;
    }
  }

  if (nameError !== undefined || plannedOnError !== undefined || budgetError !== undefined) {
    return {
      ok: false,
      errors: { name: nameError, plannedOn: plannedOnError, budget: budgetError },
    };
  }

  return {
    ok: true,
    input: {
      name,
      category: draft.category,
      institutionId: draft.institutionId,
      plannedOn,
      budgetMinor,
      notes: optionalText(draft.notes),
    },
  };
}

/**
 * 草稿相对初始状态是否已有改动。
 *
 * 用来决定返回时要不要弹放弃确认（IA 第 4.3 节第 4 条）。
 * 逐字段与初始草稿比较，而不是判断「是否非空」：编辑时所有字段一打开就都有值，
 * 按非空判断会让「什么都没改就返回」也弹确认。
 */
export function isWishlistDraftDirty(draft: WishlistDraft, initial: WishlistDraft): boolean {
  return (
    draft.name !== initial.name ||
    draft.category !== initial.category ||
    draft.institutionId !== initial.institutionId ||
    draft.plannedOn !== initial.plannedOn ||
    draft.budget !== initial.budget ||
    draft.notes !== initial.notes
  );
}
