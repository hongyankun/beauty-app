import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import type { BeautyEventCard } from '@/features/events/event-summary';
import { listBeautyEventCards } from '@/features/events/services/list-beauty-events';

/**
 * 首页概览查询用例。
 *
 * 两个数字都由 SQLite 聚合得出，这里只做最后一步派生与字段改名，
 * 不把记录列表读进内存循环累加（任务书第六节）。
 */

/**
 * 首页「最近变美」最多展示的变美记录条数（PRD 第 8.2 节，BT-0024 裁决 7）。
 * 以变美记录为单位：同一次到店无论有几条使用记录，只显示一次。
 */
export const RECENT_EVENT_LIMIT = 3;

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
  /** 最近的变美记录，最多 `RECENT_EVENT_LIMIT` 条，与变美历史共用同一套摘要 */
  readonly recentEvents: readonly BeautyEventCard[];
};

/**
 * 读取首页概览。
 *
 * 两次读取并行且不包在事务里，理由同 `getPurchaseDetail`：把只读查询升级成
 * 独占事务会与正在保存的核销互相抢锁。两条语句各自一致，而写入方完成后
 * 首页会重新获得焦点并整体重读，不会停在拼接出来的中间状态。
 */
export async function getHomeDashboard(dataAccess: DataAccess): Promise<HomeDashboard> {
  const [totals, recentEvents] = await Promise.all([
    dataAccess.dashboard.getTotals(DEFAULT_PROFILE_ID),
    listBeautyEventCards(dataAccess, RECENT_EVENT_LIMIT),
  ]);

  return {
    // 逐项夹到 0 再相加（SQL 里完成），不会出现负数（E-05）。
    pendingCount: totals.remaining_count,
    totalSpendMinor: totals.total_amount_minor,
    recentEvents,
  };
}
