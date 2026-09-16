import { PURCHASE_ITEM_CATEGORIES, type PurchaseItemCategory } from '@/db';

/** 项目分类的中文显示名（PRD 第 6.3 节）。库里存 ASCII code，中文只属于 UI 层。 */
export const PURCHASE_ITEM_CATEGORY_LABELS: Record<PurchaseItemCategory, string> = {
  light_energy: '光电类',
  injection: '注射类',
  chemical_peel: '化学焕肤',
  mesotherapy: '中胚层微针',
  cleansing: '清洁',
  surgery: '手术类',
  other: '其他',
};

/** 供选择器按固定顺序渲染，顺序与 PRD 第 6.3 节一致。 */
export const PURCHASE_ITEM_CATEGORY_OPTIONS: readonly {
  readonly value: PurchaseItemCategory;
  readonly label: string;
}[] = PURCHASE_ITEM_CATEGORIES.map((value) => ({
  value,
  label: PURCHASE_ITEM_CATEGORY_LABELS[value],
}));
