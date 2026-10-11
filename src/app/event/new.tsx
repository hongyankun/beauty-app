import { NewBeautyEventScreen } from '@/features/events/screens/new-beauty-event-screen';

/**
 * 路由 `/event/new`：记录一次变美（BT-0023 裁决 1）。
 *
 * 挂在根 Stack 上，覆盖 Tab 栏（IA 第 4.3 节第 1 条）。可选参数 `purchaseItemId`
 * 由套餐详情的项目行带入，预选为第一行的来源。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function NewBeautyEventRoute() {
  return <NewBeautyEventScreen />;
}
