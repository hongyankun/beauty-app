import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemCategory,
  type RedemptionStatus,
} from '@/db';

/**
 * 套餐详情查询用例。
 *
 * 三层余次（套餐总剩余、项目剩余）全部在这里由「购买次数 − 有效核销数」派生，
 * 数据库里没有任何一列叫 remaining（ADR-013、ARCHITECTURE 第四节）。
 *
 * 有效期不参与余次计算：套餐过期不会让剩余次数变成 0（ADR-017）。
 */

export type PurchaseDetailItem = {
  readonly id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  /** 购买次数 */
  readonly quantity: number;
  /** 已核销次数，只统计有效核销 */
  readonly redeemedCount: number;
  /** 派生值：购买次数 − 已核销次数 */
  readonly remaining: number;
  /** 单次金额，整数分 */
  readonly unitAmountMinor: number;
  readonly notes: string | null;
};

export type PurchaseDetailRedemption = {
  readonly id: string;
  readonly purchaseItemId: string;
  readonly itemName: string;
  readonly redeemedOn: BusinessDate;
  /** 核销当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
  readonly status: RedemptionStatus;
  readonly notes: string | null;
};

export type PurchaseDetail = {
  readonly id: string;
  readonly name: string;
  /** 购买当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  readonly totalAmountMinor: number;
  readonly currency: string;
  /** 为空表示未知或长期有效（PRD-PUR-007、E-10） */
  readonly expiresOn: BusinessDate | null;
  readonly notes: string | null;
  /** 项目总数 */
  readonly itemCount: number;
  /** 总购买次数 = 各项目购买次数之和 */
  readonly totalQuantity: number;
  /** 有效核销次数 = 各项目已核销次数之和 */
  readonly redeemedCount: number;
  /** 总剩余次数 = 各项目剩余次数之和 */
  readonly remaining: number;
  readonly items: readonly PurchaseDetailItem[];
  /** 核销历史，按核销日期倒序、同日按创建时间倒序；含已撤销的记录 */
  readonly redemptions: readonly PurchaseDetailRedemption[];
};

/**
 * 读取单个套餐的完整详情。套餐不存在或不属于当前档案时返回 null。
 *
 * 三次读取不包在事务里：把只读查询升级成独占事务，会和正在保存的核销互相抢锁，
 * 反而更容易失败。三条语句各自一致，而唯一的写入方（核销事务）完成后
 * 页面会重新获得焦点并整体重读，因此不会停留在拼接出来的中间状态。
 */
export async function getPurchaseDetail(
  dataAccess: DataAccess,
  purchaseId: string,
): Promise<PurchaseDetail | null> {
  const purchase = await dataAccess.purchases.findById(DEFAULT_PROFILE_ID, purchaseId);
  if (purchase === null) {
    return null;
  }

  const [itemRows, redemptionRows] = await Promise.all([
    dataAccess.purchases.listItemDetails(purchase.id),
    dataAccess.redemptions.listByPurchase(purchase.id),
  ]);

  const items: PurchaseDetailItem[] = itemRows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    redeemedCount: row.active_redemption_count,
    // 理论上不会为负；真为负说明数据异常，界面上仍然只展示 0，
    // 不把负数余次呈现给用户（E-05：不得允许负数余次）。
    remaining: Math.max(0, row.quantity - row.active_redemption_count),
    unitAmountMinor: row.unit_amount_minor,
    notes: row.notes,
  }));

  return {
    id: purchase.id,
    name: purchase.name,
    institutionName: purchase.institution_name_snapshot,
    city: purchase.city_snapshot,
    purchaseDate: purchase.purchase_date,
    totalAmountMinor: purchase.total_amount_minor,
    currency: purchase.currency,
    expiresOn: purchase.expires_on,
    notes: purchase.notes,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    redeemedCount: items.reduce((sum, item) => sum + item.redeemedCount, 0),
    // 套餐总剩余由各项目的剩余相加，而不是「总购买次数 − 总核销数」：
    // 后者会让某个项目的异常负值去抵消另一个项目真实存在的剩余次数。
    remaining: items.reduce((sum, item) => sum + item.remaining, 0),
    items,
    redemptions: redemptionRows.map((row) => ({
      id: row.id,
      purchaseItemId: row.purchase_item_id,
      itemName: row.item_name,
      redeemedOn: row.redeemed_on,
      institutionName: row.institution_name_snapshot,
      city: row.city_snapshot,
      status: row.status,
      notes: row.notes,
    })),
  };
}
