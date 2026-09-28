import { otherRegionSelection, type ProvinceCitySelection } from '@/data/administrative-divisions';
import type { PurchaseItemCategory } from '@/db';
import {
  locationColumnsFromSelection,
  selectionMatchesStored,
} from '@/features/institutions/services/institution-location';
import { compareBusinessDates, parseBusinessDate } from '@/utils/business-date';
import { cleanInstitutionName } from '@/utils/institution-name';
import { formatMinorForInput, parseYuanToMinor } from '@/utils/money';
import { parseQuantity } from '@/utils/quantity';
import {
  summarizeAllocation,
  type AllocationFacts,
  type AllocationSummary,
} from './services/purchase-allocation';
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

/**
 * 草稿里的购买人。
 *
 * 名称只用于显示：编辑时是购买当时的快照，新选一个人时是列表里的当前名称。
 * 真正写进库的快照由 service 在事务内决定，不信任这里的名称。
 */
export type PurchaserDraft = {
  readonly id: string;
  readonly name: string;
  /** 已归档的人只能作为原值保留，选择器照常显示并标注「已归档」 */
  readonly isArchived: boolean;
};

export type PurchaseItemDraft = {
  /** 仅用于 React key 与错误映射，不入库 */
  readonly key: string;
  /** 既有项目的 ID；null 表示这一行是本次新增的项目 */
  readonly purchaseItemId: string | null;
  readonly name: string;
  readonly category: PurchaseItemCategory | null;
  readonly quantity: string;
  /** 分配到这个项目的总金额，元，原样保存用户输入的文本 */
  readonly allocatedAmount: string;
  readonly notes: string;
};

export type PurchaseDraft = {
  readonly name: string;
  /** 购买人，必填，永远有值：新增时默认「自己」，编辑时为库里现有的购买人 */
  readonly purchaser: PurchaserDraft;
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  /**
   * 当场新增机构时，新机构的地点（BT-0019B2）。只在「新机构」模式下提交，而且只在
   * 真的新建了机构时写入；套餐自己不再填城市，城市快照跟随所选机构。
   */
  readonly newInstitutionLocation: ProvinceCitySelection | null;
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
  readonly allocatedAmount?: string;
};

/** 第一步（套餐信息）的字段错误。 */
export type PurchaseInfoErrors = {
  readonly name?: string;
  readonly institution?: string;
  readonly purchaseDate?: string;
  readonly totalAmount?: string;
  readonly expiresOn?: string;
};

export type PurchaseFormErrors = PurchaseInfoErrors & {
  /** 项目列表整体的问题，例如一个项目都没有 */
  readonly itemList?: string;
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

/** 一个既有项目的购买次数下限及其依据。 */
export type QuantityFloor = {
  /** 最小可填次数：`min(有效核销次数, 库里现在的次数)` */
  readonly minQuantity: number;
  /** 当前有效核销次数，只用于提示 */
  readonly redeemedCount: number;
};

/** 校验时的附加约束，新增流程不需要传。 */
export type PurchaseDraftValidationOptions = {
  /**
   * 以项目草稿的 `key` 为索引的购买次数下限。
   *
   * 通常就是有效核销次数；历史超用的项目（有效核销数 > 购买次数，DATA_MODEL_V4
   * 第 11.4 节）下限是它现在的次数：可以保持或调高，不能再调低。
   *
   * 这是两层次数安全校验的第一层，作用是让用户在按下保存**之前**就看到原因
   * （PRD-PUR-008、E-06）。第二层在 `updatePurchase` 的事务里，那一层才是最终裁决。
   */
  readonly minQuantityByKey?: Readonly<Record<string, QuantityFloor>>;
};

/** 次数下限的提示；同时给出已核销次数与最小可填值（E-06）。 */
export function quantityFloorMessage(floor: QuantityFloor): string {
  return floor.minQuantity === floor.redeemedCount
    ? `已核销 ${floor.redeemedCount} 次，购买次数不能少于 ${floor.minQuantity}`
    : `已核销 ${floor.redeemedCount} 次，购买次数不能少于原来的 ${floor.minQuantity}`;
}

export function createEmptyItemDraft(key: string): PurchaseItemDraft {
  return {
    key,
    purchaseItemId: null,
    name: '',
    category: null,
    quantity: '',
    allocatedAmount: '',
    notes: '',
  };
}

/** 初始草稿：购买日期默认今天，购买人默认「自己」，项目区默认给出一行空项目（IA 第 3.6.1 节）。 */
export function createInitialDraft(
  today: string,
  firstItemKey: string,
  purchaser: PurchaserDraft,
): PurchaseDraft {
  return {
    name: '',
    purchaser,
    institutionMode: 'none',
    institutionId: null,
    institutionQuery: '',
    newInstitutionLocation: null,
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
    // 显示购买当时的名称快照；这个人后来改名或归档都不影响这里（快照不回写）。
    purchaser: {
      id: model.purchaserPersonId,
      name: model.purchaserName,
      isArchived: model.purchaserArchived,
    },
    // 机构 ID 还在就按「已选中」呈现；只剩快照名说明这条记录的机构已经不在可选列表里，
    // 此时把快照名放进输入框当作一个待确认的新机构名，不假装用户什么都没填过。
    institutionMode:
      model.institutionId !== null ? 'existing' : model.institutionName !== null ? 'new' : 'none',
    institutionId: model.institutionId,
    institutionQuery: model.institutionName ?? '',
    // 旧数据只剩快照名时，保存会按这个名称新建（或复用）机构；新建时沿用套餐原来的城市文字，
    // 与接入省市之前的做法一致，不按文字猜省市代码。
    newInstitutionLocation:
      model.institutionId === null && model.institutionName !== null
        ? otherRegionSelection(model.city ?? '')
        : null,
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
      allocatedAmount: formatMinorForInput(item.allocatedAmountMinor),
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
    return {
      kind: 'new',
      name: cleanInstitutionName(draft.institutionQuery),
      location: draft.newInstitutionLocation,
    };
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

type ParsedPurchaseInfo = {
  readonly errors: PurchaseInfoErrors;
  readonly selection: InstitutionSelection;
  readonly purchaseDate: ReturnType<typeof parseBusinessDate>;
  readonly totalAmount: ReturnType<typeof parseYuanToMinor>;
  readonly expiresOn: string | null;
};

function parsePurchaseInfo(draft: PurchaseDraft): ParsedPurchaseInfo {
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

  return {
    errors: {
      name: nameError,
      institution: institutionError,
      purchaseDate: purchaseDateError,
      totalAmount: totalAmountError,
      expiresOn: expiresOnError,
    },
    selection,
    purchaseDate,
    totalAmount,
    expiresOn,
  };
}

/** 第一步的字段错误是否存在。 */
export function hasPurchaseInfoError(errors: PurchaseInfoErrors): boolean {
  return (
    errors.name !== undefined ||
    errors.institution !== undefined ||
    errors.purchaseDate !== undefined ||
    errors.totalAmount !== undefined ||
    errors.expiresOn !== undefined
  );
}

/**
 * 只校验第一步的套餐信息。
 *
 * 「下一步」用它把用户挡在第一步：总价都填不对，第二步的分配摘要也就无从算起。
 */
export function validatePurchaseInfo(draft: PurchaseDraft): PurchaseInfoErrors {
  return parsePurchaseInfo(draft).errors;
}

/**
 * 校验整份草稿。
 *
 * 一次性收集**全部**字段的错误再返回，不在第一个错误处短路：
 * 用户应该一次看到所有需要修改的地方，而不是改一个冒一个。
 *
 * 这里只校验每个字段自身；分配合计是否等于总价由 `checkAllocationSave` 判断，
 * 因为编辑一个历史不平衡的套餐时，这条规则取决于金额结构有没有被改过。
 */
export function validatePurchaseDraft(
  draft: PurchaseDraft,
  options: PurchaseDraftValidationOptions = {},
): PurchaseDraftValidation {
  const itemErrors: Record<string, PurchaseItemErrors> = {};
  const { errors: infoErrors, selection, purchaseDate, totalAmount, expiresOn } =
    parsePurchaseInfo(draft);

  const items: PurchaseDraftItemInput[] = [];
  for (const item of draft.items) {
    const errors: {
      name?: string;
      category?: string;
      quantity?: string;
      allocatedAmount?: string;
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
      const floor = options.minQuantityByKey?.[item.key];
      if (floor !== undefined && quantity.quantity < floor.minQuantity) {
        errors.quantity = quantityFloorMessage(floor);
      }
    }

    // 分配金额必填，允许填 0 表示赠送项目（PRD 第 5B.6 节）。
    const allocatedAmount = parseYuanToMinor(item.allocatedAmount);
    if (!allocatedAmount.ok) {
      errors.allocatedAmount =
        allocatedAmount.reason === 'empty'
          ? '请填写项目分配金额，赠送项目填 0'
          : AMOUNT_MESSAGES[allocatedAmount.reason];
    }

    if (Object.keys(errors).length > 0) {
      itemErrors[item.key] = errors;
      continue;
    }
    if (item.category !== null && quantity.ok && allocatedAmount.ok) {
      items.push({
        purchaseItemId: item.purchaseItemId,
        name: item.name.trim(),
        category: item.category,
        quantity: quantity.quantity,
        allocatedAmountMinor: allocatedAmount.minor,
        notes: optionalText(item.notes),
      });
    }
  }

  const errors: PurchaseFormErrors = {
    ...infoErrors,
    itemList: draft.items.length === 0 ? '至少添加一个项目' : undefined,
    items: itemErrors,
  };

  if (hasAnyError(errors) || !purchaseDate.ok || !totalAmount.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      name: draft.name.trim(),
      purchaserPersonId: draft.purchaser.id,
      institution: selection,
      purchaseDate: purchaseDate.value,
      totalAmountMinor: totalAmount.minor,
      expiresOn,
      notes: optionalText(draft.notes),
      items,
    },
  };
}

/** 第二步摘要卡片的数据。 */
export type DraftAllocation = {
  /** 总价还不能解析时为 null，此时没有可信的摘要可展示 */
  readonly summary: AllocationSummary | null;
  /** 分配金额还没填或填得不合法的项目数；它们暂按 0 计入已分配 */
  readonly incompleteCount: number;
};

/**
 * 按当前草稿实时汇总分配情况，整数分。
 *
 * 还没填好的行按 0 计入，同时单独报告有几行没填好：摘要要一边输入一边更新，
 * 不能等所有行都合法才出现；但也不能让用户误以为那几行已经分配完了。
 */
export function summarizeDraftAllocation(draft: PurchaseDraft): DraftAllocation {
  let incompleteCount = 0;
  const amounts: number[] = [];
  for (const item of draft.items) {
    const amount = parseYuanToMinor(item.allocatedAmount);
    if (amount.ok) {
      amounts.push(amount.minor);
    } else {
      incompleteCount += 1;
    }
  }
  const total = parseYuanToMinor(draft.totalAmount);
  return {
    summary: total.ok ? summarizeAllocation(total.minor, amounts) : null,
    incompleteCount,
  };
}

/** 草稿里的金额结构；总价、任一行次数或分配金额还不能解析时为 null。 */
export function draftAllocationFacts(draft: PurchaseDraft): AllocationFacts | null {
  const total = parseYuanToMinor(draft.totalAmount);
  if (!total.ok) {
    return null;
  }
  const items: { id: string | null; quantity: number; allocatedMinor: number }[] = [];
  for (const item of draft.items) {
    const quantity = parseQuantity(item.quantity);
    const amount = parseYuanToMinor(item.allocatedAmount);
    if (!quantity.ok || !amount.ok) {
      return null;
    }
    items.push({
      id: item.purchaseItemId,
      quantity: quantity.quantity,
      allocatedMinor: amount.minor,
    });
  }
  return { totalMinor: total.minor, items };
}

/** 校验通过后的输入里的金额结构，与 service 比较的是同一组事实。 */
export function inputAllocationFacts(input: PurchaseDraftInput): AllocationFacts {
  return {
    totalMinor: input.totalAmountMinor,
    items: input.items.map((item) => ({
      id: item.purchaseItemId,
      quantity: item.quantity,
      allocatedMinor: item.allocatedAmountMinor,
    })),
  };
}

/** 编辑页打开那一刻库里的金额结构，是界面判断「金额结构有没有改」的基准。 */
export function editModelAllocationFacts(model: PurchaseEditModel): AllocationFacts {
  return {
    totalMinor: model.totalAmountMinor,
    items: model.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      allocatedMinor: item.allocatedAmountMinor,
    })),
  };
}

function isSameItem(item: PurchaseItemDraft, initial: PurchaseItemDraft): boolean {
  return (
    item.purchaseItemId === initial.purchaseItemId &&
    item.name === initial.name &&
    item.category === initial.category &&
    item.quantity === initial.quantity &&
    item.allocatedAmount === initial.allocatedAmount &&
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
 * 当前在第几步不属于草稿，来回切换步骤不算改动。
 *
 * 金额按输入框里的原文比较，不按解析后的分比较：把「900.00」改成「900」算一次改动。
 * 这是有意的——放弃确认宁可多问一次，也不能在用户确实动过输入框时静默丢掉；
 * 金额结构是否改动（决定历史差额能否保留）另由 `hasAmountOrStructureChange` 按整数分判断。
 */
export function isDraftDirty(draft: PurchaseDraft, initial: PurchaseDraft): boolean {
  if (
    draft.name !== initial.name ||
    draft.purchaser.id !== initial.purchaser.id ||
    draft.institutionMode !== initial.institutionMode ||
    draft.institutionId !== initial.institutionId ||
    draft.institutionQuery !== initial.institutionQuery ||
    !selectionMatchesStored(
      draft.newInstitutionLocation,
      locationColumnsFromSelection(initial.newInstitutionLocation),
    ) ||
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
