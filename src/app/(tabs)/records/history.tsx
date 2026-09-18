import { RedemptionHistoryScreen } from '@/features/purchases/screens/redemption-history-screen';

/**
 * 路由 `/(tabs)/records/history`：完整核销历史。
 *
 * 路径以 IA 第 4 节与第 4.1 节的规划为准（那里写的是 `history`），
 * 压在记录 Tab 自己的栈里，保留 Tab 栏，不产生第二个 Tab（IA 第 4.3 节第 2 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function RedemptionHistoryRoute() {
  return <RedemptionHistoryScreen />;
}
