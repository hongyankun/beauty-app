import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemCategory,
} from '@/db';

/**
 * 编辑套餐的初值查询用例。
 *
 * 与 `getPurchaseDetail` 分开，因为两页问的问题不一样：详情页只需要「已核销几次」，
 * 编辑页还需要知道「这个项目能不能删」，而后者取决于**含已撤销在内**的全部核销数。
 * 把两个用途塞进同一个返回结构，会让详情页凭空多出一个它不该关心的字段。
 *
 * 这里返回的数字只用于**渲染与前置提示**。保存时的判定不看它们：那时候页面可能
 * 已经停留了很久，真正作数的是事务内重读的结果（见 `update-purchase`）。
 */

export type PurchaseEditItem = {
  readonly id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  /** 购买次数 */
  readonly quantity: number;
  /** 单次金额，整数分 */
  readonly unitAmountMinor: number;
  readonly notes: string | null;
  /** 已核销次数，只统计有效核销；次数最少只能改到这个值（PRD-PUR-008） */
  readonly redeemedCount: number;
  /** 是否有过任何核销记录，含已撤销；为真时不允许从套餐中删除该项目 */
  readonly hasRedemptionHistory: boolean;
};

export type PurchaseEditModel = {
  readonly id: string;
  readonly name: string;
  /** 已关联的机构 ID；未填写机构时为 null */
  readonly institutionId: string | null;
  /** 购买当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  readonly totalAmountMinor: number;
  readonly expiresOn: BusinessDate | null;
  readonly notes: string | null;
  readonly items: readonly PurchaseEditItem[];
};

/** 读取编辑页所需的全部初值。套餐不存在或不属于当前档案时返回 null。 */
export async function getPurchaseForEdit(
  dataAccess: DataAccess,
  purchaseId: string,
): Promise<PurchaseEditModel | null> {
  const purchase = await dataAccess.purchases.findById(DEFAULT_PROFILE_ID, purchaseId);
  if (purchase === null) {
    return null;
  }

  const itemRows = await dataAccess.purchases.listItemsForEdit(purchase.id);

  return {
    id: purchase.id,
    name: purchase.name,
    institutionId: purchase.institution_id,
    institutionName: purchase.institution_name_snapshot,
    city: purchase.city_snapshot,
    purchaseDate: purchase.purchase_date,
    totalAmountMinor: purchase.total_amount_minor,
    expiresOn: purchase.expires_on,
    notes: purchase.notes,
    items: itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      unitAmountMinor: row.unit_amount_minor,
      notes: row.notes,
      redeemedCount: row.active_redemption_count,
      hasRedemptionHistory: row.redemption_count > 0,
    })),
  };
}
