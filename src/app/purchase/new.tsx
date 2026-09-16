import { NewPurchaseScreen } from '@/features/purchases/screens/new-purchase-screen';

/**
 * 路由 `/purchase/new`：新增购买记录。
 *
 * 挂在根 Stack 上而不是记录 Tab 内，因此会覆盖 Tab 栏，
 * 避免用户填写途中误切 Tab 丢失内容（IA 第 4.3 节第 1 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function NewPurchaseRoute() {
  return <NewPurchaseScreen />;
}
