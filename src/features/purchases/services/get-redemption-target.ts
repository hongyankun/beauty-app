import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';

/**
 * 核销表单的目标项目查询用例。
 *
 * 表单只需要「这个项目是什么、还剩几次、机构与有效期默认值是什么」，
 * 不需要整个套餐详情。核销页只拿到 `purchaseItemId` 一个路由参数，
 * 其余全部在这里从数据库读出来（任务书第五节：不通过路由传业务对象）。
 */
export type RedemptionTarget = {
  readonly purchaseItemId: string;
  readonly itemName: string;
  readonly purchaseId: string;
  readonly purchaseName: string;
  /** 购买次数 */
  readonly quantity: number;
  /** 已核销次数，只统计有效核销 */
  readonly redeemedCount: number;
  /** 派生值：购买次数 − 已核销次数 */
  readonly remaining: number;
  /** 套餐购买日期，用于「核销日期早于购买日期」的保存前确认（PRD-RED-009、E-15） */
  readonly purchaseDate: BusinessDate;
  /** 套餐有效期，为空表示未知或长期有效，不参与过期提醒（E-10、ADR-017） */
  readonly expiresOn: BusinessDate | null;
  /** 套餐的机构，作为核销机构的默认值（PRD-RED-003） */
  readonly institutionId: string | null;
  readonly institutionName: string | null;
  readonly city: string | null;
};

/** 读取一个待核销项目的当前状态。项目不存在或不属于当前档案时返回 null。 */
export async function getRedemptionTarget(
  dataAccess: DataAccess,
  purchaseItemId: string,
): Promise<RedemptionTarget | null> {
  const item = await dataAccess.purchases.findItemContext(DEFAULT_PROFILE_ID, purchaseItemId);
  if (item === null) {
    return null;
  }

  const redeemedCount = await dataAccess.redemptions.countActiveByItem(item.id);

  return {
    purchaseItemId: item.id,
    itemName: item.name,
    purchaseId: item.purchase_id,
    purchaseName: item.purchase_name,
    quantity: item.quantity,
    redeemedCount,
    remaining: Math.max(0, item.quantity - redeemedCount),
    purchaseDate: item.purchase_date,
    expiresOn: item.expires_on,
    institutionId: item.institution_id,
    institutionName: item.institution_name_snapshot,
    city: item.city_snapshot,
  };
}
