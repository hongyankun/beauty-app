import { EditPurchaseScreen } from '@/features/purchases/screens/edit-purchase-screen';

/**
 * 路由 `/purchase/[purchaseId]/edit`：编辑购买记录（IA 第 4 节已规划该路由）。
 *
 * 与 `/purchase/new` 一样挂在根 Stack 上，覆盖 Tab 栏，避免用户在填写中
 * 误切 Tab 丢失内容（IA 第 4.3 节第 1 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function EditPurchaseRoute() {
  return <EditPurchaseScreen />;
}
