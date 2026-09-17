import { RedeemPickerScreen } from '@/features/purchases/screens/redeem-picker-screen';

/**
 * 路由 `/redeem`：快速核销的项目选择页（IA 第 4 节已规划该路由）。
 *
 * 与 `/redeem/[purchaseItemId]` 是同一条流程的两步：从首页进来时项目未知，
 * 先在这里选，再进入已有的核销表单。挂在根 Stack 上，覆盖 Tab 栏
 * （IA 第 4.3 节第 1 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function RedeemPickerRoute() {
  return <RedeemPickerScreen />;
}
