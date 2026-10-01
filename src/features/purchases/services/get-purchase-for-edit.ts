import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';
import { identityFromColumns, type PurchaseItemIdentity } from './purchase-item-columns';

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
  /** 套餐项目当前的显示名称 */
  readonly name: string;
  /**
   * 库里的分类、目录代码与自定义名称，原样照搬（BT-0021B）。当前目录不认识的值也不清洗、
   * 不改写：表单原样带回，service 发现没变就原样写回。
   */
  readonly service: PurchaseItemIdentity;
  /** 购买次数 */
  readonly quantity: number;
  /** 分配到这个项目的总金额，整数分；单次均价只由它派生展示，不回写 */
  readonly allocatedAmountMinor: number;
  readonly notes: string | null;
  /** 已核销次数，只统计有效核销 */
  readonly redeemedCount: number;
  /**
   * 购买次数最少能改到几次：有效核销数与现有次数中较小的一个（PRD-PUR-008）。
   * 历史超用的项目可以保持或调高次数，不能调低；规则与 `update-purchase` 的事务内校验一致。
   */
  readonly minQuantity: number;
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
  /** 购买人 ID */
  readonly purchaserPersonId: string;
  /** 购买当时的购买人名称快照；编辑页显示它，不显示这个人现在的名称 */
  readonly purchaserName: string;
  /** 这个人现在是否已归档；已归档时只能原样保留，不能被重新选中 */
  readonly purchaserArchived: boolean;
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
  // 只用来判断归档状态；名称仍以快照为准。外键保证这个人一定存在，
  // 万一查不到也按「不可重新选中」处理，与已归档一致。
  const purchaser = await dataAccess.people.findById(
    DEFAULT_PROFILE_ID,
    purchase.purchaser_person_id,
  );

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
    purchaserPersonId: purchase.purchaser_person_id,
    purchaserName: purchase.purchaser_name_snapshot,
    purchaserArchived: purchaser === null || purchaser.status !== 'active',
    items: itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      service: identityFromColumns(row),
      quantity: row.quantity,
      allocatedAmountMinor: row.allocated_amount_minor,
      notes: row.notes,
      redeemedCount: row.active_redemption_count,
      minQuantity: Math.min(row.active_redemption_count, row.quantity),
      hasRedemptionHistory: row.redemption_count > 0,
    })),
  };
}
