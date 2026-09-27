import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';

/**
 * 套餐列表查询用例。
 *
 * `remaining` 在这里派生，不落库也不接受写入
 * （ADR-013、ARCHITECTURE 第四节、任务书第七节）。
 */

/** 记录页的三个筛选：全部 / 待使用 / 已完成。 */
export type PurchaseStatusFilter = 'all' | 'pending' | 'completed';

export type PurchaseSummary = {
  readonly id: string;
  readonly name: string;
  /** 录入当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  readonly totalAmountMinor: number;
  readonly currency: string;
  readonly expiresOn: BusinessDate | null;
  readonly itemCount: number;
  /** 所有项目购买次数之和 */
  readonly totalQuantity: number;
  /** 有效核销数（只算 status = active 的记录） */
  readonly redeemedCount: number;
  /** 派生值：各项目 max(0, 购买次数 − 有效核销数) 之和 */
  readonly remaining: number;
};

/**
 * 读取当前档案的全部套餐概览。
 *
 * 排序由 SQL 完成：购买日期倒序，同日按创建时间倒序（任务书第八节）。
 */
export async function listPurchases(dataAccess: DataAccess): Promise<PurchaseSummary[]> {
  const rows = await dataAccess.purchases.listSummaries(DEFAULT_PROFILE_ID);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    institutionName: row.institution_name_snapshot,
    city: row.city_snapshot,
    purchaseDate: row.purchase_date,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    expiresOn: row.expires_on,
    itemCount: row.item_count,
    totalQuantity: row.total_quantity,
    redeemedCount: row.active_redemption_count,
    // 逐项夹到 0 再相加（SQL 里完成）：历史超用的项目只显示 0，
    // 不抵扣同一套餐其他项目的余次（DATA_MODEL_V4 第 11.4 节、E-05）。
    remaining: row.remaining_count,
  }));
}

/**
 * 按状态筛选。
 *
 * 筛选依据的是派生出来的 `remaining`，不是任何数据库字段。
 * 有效期本轮只保存与展示，不参与筛选，也不改变 `remaining`（任务书第六节）。
 */
export function filterPurchaseSummaries(
  summaries: readonly PurchaseSummary[],
  filter: PurchaseStatusFilter,
): PurchaseSummary[] {
  switch (filter) {
    case 'pending':
      return summaries.filter((summary) => summary.remaining > 0);
    case 'completed':
      return summaries.filter((summary) => summary.remaining === 0);
    case 'all':
    default:
      return [...summaries];
  }
}
