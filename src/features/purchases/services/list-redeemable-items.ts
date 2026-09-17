import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';
import { compareBusinessDates } from '@/utils/business-date';

/**
 * 快捷核销的候选项目查询用例。
 *
 * 只列出**还有剩余次数**的项目。过滤条件由 SQL 完成，`remaining` 仍在这里派生，
 * 库里没有这一列（ADR-013）。
 */

export type RedeemableItem = {
  readonly purchaseItemId: string;
  readonly itemName: string;
  readonly purchaseId: string;
  readonly purchaseName: string;
  /** 套餐录入当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
  /** 派生值：购买次数 − 有效核销数，必定大于 0 */
  readonly remaining: number;
  /** 为空表示未知或长期有效（E-10） */
  readonly expiresOn: BusinessDate | null;
};

/**
 * 读取当前档案下全部仍可核销的项目。
 *
 * 排序由 SQL 完成：有有效期的在前且越早越靠前，没有有效期的在后，
 * 同有效期按套餐购买日期倒序，最后按项目录入顺序（任务书第五节）。
 * PRD 与 IA 没有为这个页面定义别的排序口径，因此采用该顺序。
 */
export async function listRedeemableItems(dataAccess: DataAccess): Promise<RedeemableItem[]> {
  const rows = await dataAccess.purchases.listRedeemableItems(DEFAULT_PROFILE_ID);

  return rows.map((row) => ({
    purchaseItemId: row.id,
    itemName: row.name,
    purchaseId: row.purchase_id,
    purchaseName: row.purchase_name,
    institutionName: row.institution_name_snapshot,
    city: row.city_snapshot,
    // SQL 已经过滤掉 quantity <= 有效核销数的项目，这里的 max 只是兜底，
    // 保证任何情况下都不会把负数余次带到界面上（E-05）。
    remaining: Math.max(0, row.quantity - row.active_redemption_count),
    expiresOn: row.expires_on,
  }));
}

/**
 * 有效期是否已经早于给定日期。
 *
 * 只用于在选择页陈述「已过有效期」这个事实：过期既不清零余次，也不禁止核销
 * （ADR-017、PRD-RED-014）。有效期为空时永远返回 false（E-10）。
 */
export function isExpiredOn(expiresOn: BusinessDate | null, today: BusinessDate): boolean {
  return expiresOn !== null && compareBusinessDates(expiresOn, today) < 0;
}
