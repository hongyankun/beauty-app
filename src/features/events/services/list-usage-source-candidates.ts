import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess, type PurchaseKind } from '@/db';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';

/**
 * 「使用已有套餐」来源与修正来源的候选购买项目（DATA_MODEL_V4 第 5.1、5.5 节）。
 *
 * 只列出**当前档案、仍有余次**的项目，过滤由 SQL 完成，余次在这里派生（ADR-013）。
 * 单次购买也在其中：它唯一的使用记录被撤销后，这一次可以再次使用（PRD 第 5B.8 节），界面标注「单次」。
 * 候选只是便利：保存时 service 在事务内重新校验归属、余次与兼容性。
 */

export type UsageSourceCandidate = {
  readonly purchaseItemId: string;
  readonly itemName: string;
  readonly purchaseId: string;
  readonly purchaseName: string;
  readonly purchaseKind: PurchaseKind;
  readonly purchaseDate: BusinessDate;
  readonly expiresOn: BusinessDate | null;
  readonly institutionName: string | null;
  /** 派生值：购买次数 − 有效使用数，必定大于 0 */
  readonly remaining: number;
  /** 项目身份三列，原样来自库里，用于显示与修正来源的兼容判断 */
  readonly identity: PurchaseItemIdentity;
};

export async function listUsageSourceCandidates(dataAccess: DataAccess): Promise<UsageSourceCandidate[]> {
  const rows = await dataAccess.purchases.listRedeemableItems(DEFAULT_PROFILE_ID);
  return rows.map((row) => ({
    purchaseItemId: row.id,
    itemName: row.name,
    purchaseId: row.purchase_id,
    purchaseName: row.purchase_name,
    purchaseKind: row.purchase_kind,
    purchaseDate: row.purchase_date,
    expiresOn: row.expires_on,
    institutionName: row.institution_name_snapshot,
    remaining: Math.max(0, row.quantity - row.active_redemption_count),
    identity: {
      categoryCode: row.category_code,
      serviceCode: row.service_code,
      customName: row.custom_name,
    },
  }));
}
