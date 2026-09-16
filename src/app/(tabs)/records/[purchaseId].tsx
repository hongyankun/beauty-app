import { PurchaseDetailScreen } from '@/features/purchases/screens/purchase-detail-screen';

/**
 * 路由 `/(tabs)/records/[purchaseId]`：购买记录详情。
 *
 * 压在记录 Tab 自己的栈里，保留 Tab 栏，便于看完后横向切换（IA 第 4.3 节第 2 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function PurchaseDetailRoute() {
  return <PurchaseDetailScreen />;
}
