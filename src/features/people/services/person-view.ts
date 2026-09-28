import type { PersonUsageRow } from '@/db';

/**
 * 人员行 → 页面可直接渲染的视图模型。
 *
 * 列表与编辑页共用同一份映射，状态文案与关联条数的说法只写一次。
 * 这里展示的是人的**当前**名称；历史记录一律显示各自的名称快照（PRD 第 5B.5 节）。
 */

/** 状态永远带文字，不靠颜色单独区分（PRD-NFR-005）。 */
const STATUS_LABELS = {
  active: '使用中',
  archived: '已归档',
} as const;

export type PersonSummary = {
  readonly id: string;
  readonly name: string;
  readonly isSelf: boolean;
  readonly isArchived: boolean;
  /** 「使用中」或「已归档」，可直接渲染 */
  readonly statusLabel: string;
  /** 作为购买人的购买记录数 */
  readonly purchaseCount: number;
  /** 作为使用人的使用记录数，含已撤销 */
  readonly usageCount: number;
  /** 例如「购买 2 次 · 使用 5 次」 */
  readonly usageLabel: string;
  /** 被任何记录用过：只能归档，不能删除 */
  readonly isReferenced: boolean;
};

export function formatPersonUsage(purchaseCount: number, usageCount: number): string {
  return `作为购买人 ${purchaseCount} 个套餐 · 作为使用人 ${usageCount} 条记录`;
}

export function toPersonSummary(row: PersonUsageRow): PersonSummary {
  const isArchived = row.status === 'archived';
  return {
    id: row.id,
    name: row.display_name,
    isSelf: row.is_self === 1,
    isArchived,
    statusLabel: isArchived ? STATUS_LABELS.archived : STATUS_LABELS.active,
    purchaseCount: row.purchase_count,
    usageCount: row.usage_count,
    usageLabel: formatPersonUsage(row.purchase_count, row.usage_count),
    isReferenced: row.purchase_count > 0 || row.usage_count > 0,
  };
}
