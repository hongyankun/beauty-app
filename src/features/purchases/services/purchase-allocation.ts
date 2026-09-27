import { formatMinorAsYuan } from '@/utils/money';

/**
 * 套餐金额分配的纯函数（PRD 第 5B.6 节、DATA_MODEL_V4 第 6 节、ADR-023）。
 *
 * 每个套餐项目只保存**分配到它的总金额** `allocated_amount_minor`，这是唯一的金额事实。
 * 单次均价由它除以购买次数派生，只用于展示，从不写回，也从不反推分配金额。
 *
 * 表单与 service 共用这一份：表单用它实时显示「剩余待分配」并在保存前先拦一道，
 * service 用它在事务内按库里读到的值做最终裁决。全程整数分，不出现浮点累计（ADR-006）。
 */

export type AllocationStatus = 'balanced' | 'underAllocated' | 'overAllocated';

export type AllocationSummary = {
  /** 套餐总价，整数分 */
  readonly totalMinor: number;
  /** 各项目分配金额之和，整数分 */
  readonly allocatedMinor: number;
  /** 总价 − 已分配；为负表示超出总价 */
  readonly remainingMinor: number;
  readonly status: AllocationStatus;
};

function assertSafeAmount(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('金额必须是安全整数分');
  }
}

/** 汇总分配情况。任何一个输入或合计超出安全整数范围都直接抛出，不给出一个算错的结果。 */
export function summarizeAllocation(
  totalMinor: number,
  amountsMinor: readonly number[],
): AllocationSummary {
  assertSafeAmount(totalMinor);
  let allocatedMinor = 0;
  for (const amount of amountsMinor) {
    assertSafeAmount(amount);
    allocatedMinor += amount;
    assertSafeAmount(allocatedMinor);
  }
  const remainingMinor = totalMinor - allocatedMinor;
  assertSafeAmount(remainingMinor);

  return {
    totalMinor,
    allocatedMinor,
    remainingMinor,
    status:
      remainingMinor === 0 ? 'balanced' : remainingMinor > 0 ? 'underAllocated' : 'overAllocated',
  };
}

export type AveragePerUse = {
  /** 整数商，整数分 */
  readonly quotientMinor: number;
  /** 余数，整数分 */
  readonly remainderMinor: number;
  /** 是否恰好整除 */
  readonly exact: boolean;
  /** 展示用的均价：余数达到一半时进一分 */
  readonly displayMinor: number;
};

/**
 * 单次均价 = 分配金额 ÷ 购买次数。
 *
 * 用整数取余而不是浮点除法：商与余数都精确，展示时再决定要不要标「约」。
 */
export function averagePerUse(allocatedMinor: number, quantity: number): AveragePerUse {
  assertSafeAmount(allocatedMinor);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError('购买次数必须是正整数');
  }
  const remainderMinor = allocatedMinor % quantity;
  const quotientMinor = (allocatedMinor - remainderMinor) / quantity;
  return {
    quotientMinor,
    remainderMinor,
    exact: remainderMinor === 0,
    displayMinor: quotientMinor + (remainderMinor * 2 >= quantity ? 1 : 0),
  };
}

/** 「¥300.00/次」；除不尽时为「约 ¥333.33/次」。 */
export function formatAveragePerUse(allocatedMinor: number, quantity: number): string {
  const average = averagePerUse(allocatedMinor, quantity);
  const text = `${formatMinorAsYuan(average.displayMinor)}/次`;
  return average.exact ? text : `约 ${text}`;
}

/** 摘要卡片上的状态文字。状态不能只靠颜色表达（PRD-NFR-005）。 */
export function allocationStatusText(summary: AllocationSummary): string {
  switch (summary.status) {
    case 'balanced':
      return '已完成分配';
    case 'underAllocated':
      return `剩余待分配 ${formatMinorAsYuan(summary.remainingMinor)}`;
    case 'overAllocated':
      return `已超出套餐总价 ${formatMinorAsYuan(-summary.remainingMinor)}`;
  }
}

/** 保存被拒绝时的差额说明。 */
export function allocationGapMessage(summary: AllocationSummary): string {
  return summary.status === 'overAllocated'
    ? `已超出套餐总价 ${formatMinorAsYuan(-summary.remainingMinor)}`
    : `还有 ${formatMinorAsYuan(summary.remainingMinor)} 未分配`;
}

/** 判断金额结构是否改动时关心的一行项目。 */
export type AllocationItemFacts = {
  /** 既有项目的 ID；null 表示本次新增 */
  readonly id: string | null;
  readonly quantity: number;
  readonly allocatedMinor: number;
};

export type AllocationFacts = {
  readonly totalMinor: number;
  readonly items: readonly AllocationItemFacts[];
};

/**
 * 相对保存前的状态，金额结构是否有任何改动（DATA_MODEL_V4 第 6 节）。
 *
 * 改动指以下任意一项：总价、任一项目的购买次数、任一项目的分配金额、新增项目、删除项目。
 * 名称、分类、备注、日期、机构与购买人都不算。
 */
export function hasAmountOrStructureChange(
  stored: AllocationFacts,
  next: AllocationFacts,
): boolean {
  if (stored.totalMinor !== next.totalMinor || stored.items.length !== next.items.length) {
    return true;
  }
  const storedById = new Map(stored.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const item of next.items) {
    if (item.id === null || seen.has(item.id)) {
      return true;
    }
    seen.add(item.id);
    const before = storedById.get(item.id);
    if (
      before === undefined ||
      before.quantity !== item.quantity ||
      before.allocatedMinor !== item.allocatedMinor
    ) {
      return true;
    }
  }
  return false;
}

export type AllocationSaveCheck =
  | {
      readonly ok: true;
      readonly summary: AllocationSummary;
      /** 历史不平衡、本次未改金额结构而保留原差额 */
      readonly keptHistoricalGap: boolean;
    }
  | {
      readonly ok: false;
      readonly summary: AllocationSummary;
      /** 保存前原本就不平衡（只在编辑时可能为真） */
      readonly wasUnbalanced: boolean;
    };

/**
 * 能不能按这份分配保存。
 *
 * - 分配合计恰好等于总价：可以保存。差 1 分也不行。
 * - 不等：只有编辑一个**原本就不平衡**的套餐、且金额结构完全没改时才可以保存，
 *   原差额原样保留，App 不自动修改任何金额（PRD 第 5B.6 节）。
 *
 * `stored` 为 null 表示新增套餐。service 调用时 `stored` 必须来自事务内读到的库值，
 * 不信任客户端传来的任何「未改动」标记。
 */
export function checkAllocationSave(
  stored: AllocationFacts | null,
  next: AllocationFacts,
): AllocationSaveCheck {
  const summary = summarizeAllocation(
    next.totalMinor,
    next.items.map((item) => item.allocatedMinor),
  );
  if (summary.status === 'balanced') {
    return { ok: true, summary, keptHistoricalGap: false };
  }

  if (stored === null) {
    return { ok: false, summary, wasUnbalanced: false };
  }
  const wasUnbalanced =
    summarizeAllocation(
      stored.totalMinor,
      stored.items.map((item) => item.allocatedMinor),
    ).status !== 'balanced';
  if (wasUnbalanced && !hasAmountOrStructureChange(stored, next)) {
    return { ok: true, summary, keptHistoricalGap: true };
  }
  return { ok: false, summary, wasUnbalanced };
}

/** `checkAllocationSave` 拒绝时给用户看的一句话。 */
export function allocationSaveRejectedMessage(check: AllocationSaveCheck): string {
  const gap = allocationGapMessage(check.summary);
  if (!check.ok && check.wasUnbalanced) {
    return `这个套餐原本的金额分配与总价不一致。修改了总价、次数、分配金额或项目后，需要先补平再保存：${gap}`;
  }
  return `项目分配合计需要等于套餐总价：${gap}`;
}
