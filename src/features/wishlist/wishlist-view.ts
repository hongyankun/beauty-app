import type { WishlistItemListRow } from '@/db';
import { PURCHASE_ITEM_CATEGORY_LABELS } from '@/features/purchases/categories';
import { formatMinorAsYuan } from '@/utils/money';

/**
 * 心愿行 → 页面可直接渲染的视图模型。
 *
 * 列表与编辑页共用同一份映射：分类文案、机构说法、金额格式只写一次，
 * 两个页面就不会各说各话。repository 只给事实，中文表达全部在这里发生
 * （ARCHITECTURE 第三节）。
 *
 * 选填字段为空时一律返回 null，由界面整段省略，不铺一屏「未填写」。
 */

export type WishlistItemSummary = {
  readonly id: string;
  readonly name: string;
  /** 分类的中文名；没选时为 null */
  readonly categoryLabel: string | null;
  readonly institutionId: string | null;
  /** 机构**当前**的名称，不是快照；没填时为 null */
  readonly institutionName: string | null;
  /** 关联的机构是否已归档。归档不会清空既有关联，但界面要把状态说出来 */
  readonly institutionIsArchived: boolean;
  /** 例如「计划 2026-10-01」；没填时为 null */
  readonly plannedOnLabel: string | null;
  readonly plannedOn: string | null;
  /** 例如「预算 ¥3,000.00」；没填时为 null */
  readonly budgetLabel: string | null;
  readonly budgetMinor: number | null;
  /** 备注的首行摘要；没填时为 null */
  readonly notesSummary: string | null;
  readonly notes: string | null;
  readonly category: WishlistItemListRow['category'];
};

/**
 * 备注摘要：取第一行，空白折叠成单个空格。
 *
 * 只取首行而不按字数截断，是为了不和「最大字号下不截断」冲突：
 * 摘要出来的这一行在卡片上是完整显示、可自由换行的，后面还有内容时
 * 用省略号说明「这里还没完」，而不是把一行字切掉半截。
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

export function toWishlistItemSummary(row: WishlistItemListRow): WishlistItemSummary {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryLabel: row.category === null ? null : PURCHASE_ITEM_CATEGORY_LABELS[row.category],
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    institutionIsArchived: row.institution_is_archived === 1,
    plannedOn: row.planned_on,
    plannedOnLabel: row.planned_on === null ? null : `计划 ${row.planned_on}`,
    budgetMinor: row.budget_minor,
    budgetLabel: row.budget_minor === null ? null : `预算 ${formatMinorAsYuan(row.budget_minor)}`,
    notes: row.notes,
    notesSummary: summarizeNotes(row.notes),
  };
}
