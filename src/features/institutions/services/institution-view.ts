import type { InstitutionUsageRow } from '@/db';

/**
 * 机构行 → 页面可直接渲染的视图模型。
 *
 * 列表与编辑页共用同一份映射：状态文案、备注摘要、关联条数的说法只写一次，
 * 两个页面就不会各说各话。repository 只给事实，中文表达全部在这里发生
 * （ARCHITECTURE 第三节）。
 */

/** 机构当前状态的文案。状态永远带文字，不靠颜色单独区分（PRD-NFR-005）。 */
const STATUS_LABELS = {
  active: '使用中',
  archived: '已归档',
} as const;

export type InstitutionSummary = {
  readonly id: string;
  readonly name: string;
  /** 城市；没填时为 null，整段省略，不补占位 */
  readonly city: string | null;
  /** 备注的首行摘要；没填时为 null */
  readonly notesSummary: string | null;
  readonly isArchived: boolean;
  /** 「使用中」或「已归档」，可直接渲染 */
  readonly statusLabel: string;
  /** 关联套餐数，只按 `purchases.institution_id` 统计 */
  readonly purchaseCount: number;
  /** 关联核销数，含已撤销的记录 */
  readonly redemptionCount: number;
  /** 例如「关联 3 个套餐 · 5 条核销记录」 */
  readonly usageLabel: string;
};

/**
 * 备注摘要：取第一行，空白折叠成单个空格。
 *
 * 只取首行而不按字数截断，是为了不和「最大字号下不截断」冲突
 * （任务书第十六节）：摘要出来的这一行在卡片上是完整显示、可自由换行的，
 * 后面还有内容时用省略号说明「这里还没完」，而不是把一行字切掉半截。
 */
function summarizeNotes(notes: string | null): string | null {
  if (notes === null) {
    return null;
  }
  const lines = notes.split('\n').map((line) => line.trim().replace(/\s+/g, ' '));
  const firstIndex = lines.findIndex((line) => line !== '');
  if (firstIndex === -1) {
    return null;
  }
  const hasMore = lines.slice(firstIndex + 1).some((line) => line !== '');
  return hasMore ? `${lines[firstIndex]}…` : lines[firstIndex];
}

/** 关联条数的统一说法。0 也照实说出来：归档确认框里「关联 0 个套餐」是有用的信息。 */
export function formatUsage(purchaseCount: number, redemptionCount: number): string {
  return `关联 ${purchaseCount} 个套餐 · ${redemptionCount} 条核销记录`;
}

export function toInstitutionSummary(row: InstitutionUsageRow): InstitutionSummary {
  const isArchived = row.is_archived === 1;
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    notesSummary: summarizeNotes(row.notes),
    isArchived,
    statusLabel: isArchived ? STATUS_LABELS.archived : STATUS_LABELS.active,
    purchaseCount: row.purchase_count,
    redemptionCount: row.redemption_count,
    usageLabel: formatUsage(row.purchase_count, row.redemption_count),
  };
}
