import { PurchaseListScreen } from '@/features/purchases/screens/purchase-list-screen';

/**
 * 路由 `/(tabs)/records`：记录列表。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 * 购买记录详情与核销历史随后续任务加入。
 */
export default function RecordsRoute() {
  return <PurchaseListScreen />;
}
