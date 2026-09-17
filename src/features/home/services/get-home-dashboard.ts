import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';

/**
 * 首页概览查询用例。
 *
 * 两个数字都由 SQLite 聚合得出，这里只做最后一步派生与字段改名，
 * 不把记录列表读进内存循环累加（任务书第六节）。
 */

/** 首页「最近记录」最多展示的条数（任务书第三节）。 */
export const RECENT_REDEMPTION_LIMIT = 5;

export type HomeRecentRedemption = {
  readonly id: string;
  readonly purchaseItemId: string;
  readonly itemName: string;
  /** 所属套餐，用于展示与跳转 */
  readonly purchaseId: string;
  readonly purchaseName: string;
  readonly redeemedOn: BusinessDate;
  /** 本次核销当时的机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly city: string | null;
};

export type HomeDashboard = {
  /**
   * 待使用总次数 = 全部项目购买次数之和 − 全部有效核销数。
   *
   * 已撤销的核销不算已使用；过期不减少余次（ADR-017）；
   * 被永久删除的套餐连同其项目与记录一起消失，自然不参与统计（ADR-016）。
   */
  readonly pendingCount: number;
  /** 累计投入 = 全部套餐总价之和，整数分（ADR-006） */
  readonly totalSpendMinor: number;
  /** 最近的有效核销，最多 `RECENT_REDEMPTION_LIMIT` 条 */
  readonly recentRedemptions: readonly HomeRecentRedemption[];
};

/**
 * 读取首页概览。
 *
 * 两次读取并行且不包在事务里，理由同 `getPurchaseDetail`：把只读查询升级成
 * 独占事务会与正在保存的核销互相抢锁。两条语句各自一致，而写入方完成后
 * 首页会重新获得焦点并整体重读，不会停在拼接出来的中间状态。
 */
export async function getHomeDashboard(dataAccess: DataAccess): Promise<HomeDashboard> {
  const [totals, recentRows] = await Promise.all([
    dataAccess.dashboard.getTotals(DEFAULT_PROFILE_ID),
    dataAccess.dashboard.listRecentRedemptions(DEFAULT_PROFILE_ID, RECENT_REDEMPTION_LIMIT),
  ]);

  return {
    // 理论上不会为负；真为负说明数据异常，界面上仍然只展示 0，
    // 不把负数余次呈现给用户（E-05：不得允许负数余次）。
    pendingCount: Math.max(0, totals.total_quantity - totals.active_redemption_count),
    totalSpendMinor: totals.total_amount_minor,
    recentRedemptions: recentRows.map((row) => ({
      id: row.id,
      purchaseItemId: row.purchase_item_id,
      itemName: row.item_name,
      purchaseId: row.purchase_id,
      purchaseName: row.purchase_name,
      redeemedOn: row.redeemed_on,
      institutionName: row.institution_name_snapshot,
      city: row.city_snapshot,
    })),
  };
}
