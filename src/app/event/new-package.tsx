import { NewEventPackageScreen } from '@/features/events/screens/new-event-package-screen';

/**
 * 路由 `/event/new-package`：「记录一次变美」中「新建套餐并使用」的全屏子步骤（BT-0023 裁决 2）。
 *
 * 复用新增套餐的两步表单，但**不写数据库**：确认后把套餐草稿交回记录表单，
 * 与变美记录在同一个事务里一起保存。挂在根 Stack 上，覆盖 Tab 栏。
 */
export default function NewEventPackageRoute() {
  return <NewEventPackageScreen />;
}
