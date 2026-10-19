import type { SQLiteDatabase } from 'expo-sqlite';

import type { DashboardRepository, DashboardTotalsRow } from './types';

/**
 * 首页统计的 SQLite 实现。全部语句参数化绑定。
 *
 * 统计在 SQLite 里算完，只把几个数字带回 JS
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
  };
}
