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
      // 两个标量子查询并列，不做 JOIN 汇总：待使用次数必须逐项
      // `MAX(0, quantity − 有效使用数)` 再相加，历史超用的项目只算 0，
      // 不抵扣其他项目的余次（DATA_MODEL_V4 第 11.4 节）。有效使用数用一个
      // 预聚合子查询 LEFT JOIN 进来，只扫一遍 usage_records。这条语句没有 FROM，
      // 结果恒为一行。
      //
      // `COALESCE(SUM(...), 0)`：一条记录都没有时 SUM 返回 NULL，
      // 首页要显示的是 0 次 / ¥0.00，不是占位符。
      const row = await db.getFirstAsync<DashboardTotalsRow>(
        `SELECT
            (SELECT COALESCE(SUM(MAX(0, i.quantity - COALESCE(rc.active_count, 0))), 0)
               FROM purchase_items i
               JOIN purchases p ON p.id = i.purchase_id
               LEFT JOIN (SELECT purchase_item_id, COUNT(*) AS active_count
                            FROM usage_records
                           WHERE status = 'active' AND purchase_item_id IS NOT NULL
                           GROUP BY purchase_item_id) rc ON rc.purchase_item_id = i.id
              WHERE p.profile_id = ?) AS remaining_count,
            (SELECT COALESCE(SUM(p.total_amount_minor), 0)
               FROM purchases p
              WHERE p.profile_id = ?) AS total_amount_minor`,
        [profileId, profileId],
      );
      // 语句必定返回一行；这里只是让类型收敛，不是在掩盖读取失败——
      // 真正的失败会以异常抛出，由 hook 转成错误状态。
      return row ?? { remaining_count: 0, total_amount_minor: 0 };
    },

    async listRecentRedemptions(profileId, limit) {
      // 排序与套餐详情里的使用历史一致：事件日期倒序，同一天按创建时间倒序，
      // 让「刚刚记录的那一条」稳定排在同日的最前面。
      //
      // 只取仍关联套餐项目的有效记录：卡片要能点进套餐详情。两次 JOIN 只用来取套餐 ID
      // 并以 `purchases.profile_id` 校验档案归属；项目与套餐名称取使用记录上的快照，
      // 不取当前名称：改名后历史仍显示当时的名称（DATA_MODEL_V4 第 5 节）。
      return db.getAllAsync<RecentRedemptionRow>(
        `SELECT
            u.id,
            u.purchase_item_id,
            u.purchase_item_name_snapshot AS item_name,
            p.id                          AS purchase_id,
            u.purchase_name_snapshot      AS purchase_name,
            e.occurred_on AS redeemed_on,
            e.institution_name_snapshot,
            e.city_name_snapshot AS city_snapshot
           FROM usage_records u
           JOIN beauty_events e ON e.id = u.event_id
           JOIN purchase_items i ON i.id = u.purchase_item_id
           JOIN purchases p ON p.id = i.purchase_id
          WHERE p.profile_id = ? AND e.profile_id = p.profile_id AND u.status = 'active'
          ORDER BY e.occurred_on DESC, u.created_at DESC, u.id DESC
          LIMIT ?`,
        [profileId, limit],
      );
    },
  };
}
