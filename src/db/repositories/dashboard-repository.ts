import type { SQLiteDatabase } from 'expo-sqlite';

import type { DashboardRepository, DashboardTotalsRow, RecentRedemptionRow } from './types';

/**
 * 首页统计的 SQLite 实现。全部语句参数化绑定。
 *
 * 统计在 SQLite 里算完，只把三个数字与最多几条记录带回 JS
 * （任务书第六节：首页不得把记录列表读到内存里再循环累加）。
 */
export function createDashboardRepository(db: SQLiteDatabase): DashboardRepository {
  return {
    async getTotals(profileId) {
      // 三个标量子查询并列，不做 JOIN：项目与核销是两条独立的一对多路径，
      // JOIN 到一起会产生笛卡尔积，`SUM(quantity)` 会被核销记录数放大
      // （同 purchase-repository.listSummaries）。这条语句没有 FROM，
      // 每个子查询各扫各的索引，结果恒为一行。
      //
      // `COALESCE(SUM(...), 0)`：一条记录都没有时 SUM 返回 NULL，
      // 首页要显示的是 0 次 / ¥0.00，不是占位符。
      const row = await db.getFirstAsync<DashboardTotalsRow>(
        `SELECT
            (SELECT COALESCE(SUM(i.quantity), 0)
               FROM purchase_items i
               JOIN purchases p ON p.id = i.purchase_id
              WHERE p.profile_id = ?) AS total_quantity,
            (SELECT COUNT(*)
               FROM redemption_records r
               JOIN purchase_items i ON i.id = r.purchase_item_id
               JOIN purchases p ON p.id = i.purchase_id
              WHERE p.profile_id = ? AND r.status = 'active') AS active_redemption_count,
            (SELECT COALESCE(SUM(p.total_amount_minor), 0)
               FROM purchases p
              WHERE p.profile_id = ?) AS total_amount_minor`,
        [profileId, profileId, profileId],
      );
      // 语句必定返回一行；这里只是让类型收敛，不是在掩盖读取失败——
      // 真正的失败会以异常抛出，由 hook 转成错误状态。
      return row ?? { total_quantity: 0, active_redemption_count: 0, total_amount_minor: 0 };
    },

    async listRecentRedemptions(profileId, limit) {
      // 排序与套餐详情里的核销历史一致：核销日期倒序，同一天按创建时间倒序，
      // 让「刚刚记录的那一条」稳定排在同日的最前面。
      //
      // 两次 JOIN 既取出所属项目与套餐的名称，也是这条查询唯一的档案归属校验点：
      // redemption_records 与 purchase_items 都没有 profile_id。
      return db.getAllAsync<RecentRedemptionRow>(
        `SELECT
            r.id,
            r.purchase_item_id,
            i.name   AS item_name,
            p.id     AS purchase_id,
            p.name   AS purchase_name,
            r.redeemed_on,
            r.institution_name_snapshot,
            r.city_snapshot
           FROM redemption_records r
           JOIN purchase_items i ON i.id = r.purchase_item_id
           JOIN purchases p ON p.id = i.purchase_id
          WHERE p.profile_id = ? AND r.status = 'active'
          ORDER BY r.redeemed_on DESC, r.created_at DESC
          LIMIT ?`,
        [profileId, limit],
      );
    },
  };
}
