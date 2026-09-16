import { NewRedemptionScreen } from '@/features/purchases/screens/new-redemption-screen';

/**
 * 路由 `/redeem/[purchaseItemId]`：记录一次核销。
 *
 * 挂在根 Stack 上而不是记录 Tab 内，因此会覆盖 Tab 栏，
 * 避免用户填写途中误切 Tab 丢失内容（IA 第 4.3 节第 1 条）。
 *
 * 路由参数只有标识：`purchaseItemId` 指明核销哪个项目，
 * 可选的 `purchaseId` 用于保存成功后返回对应的套餐详情。
 * 完整业务对象一律由页面自己从数据库读取（任务书第五节）。
 */
export default function NewRedemptionRoute() {
  return <NewRedemptionScreen />;
}
