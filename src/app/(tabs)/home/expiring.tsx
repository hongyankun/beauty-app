import { ExpiringPurchasesScreen } from '@/features/home/screens/expiring-purchases-screen';

/**
 * 路由 `/(tabs)/home/expiring`：完整临期提醒页。
 *
 * 压在首页 Tab 自己的栈里，保留 Tab 栏，不产生第二个 Tab（IA 第 4.3 节第 2 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function ExpiringPurchasesRoute() {
  return <ExpiringPurchasesScreen />;
}
