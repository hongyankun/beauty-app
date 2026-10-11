import { EditBeautyEventScreen } from '@/features/events/screens/edit-beauty-event-screen';

/**
 * 路由 `/event/[eventId]/edit`：编辑变美记录的日期、机构与备注（BT-0023 裁决 1、4）。
 *
 * 挂在根 Stack 上，覆盖 Tab 栏（IA 第 4.3 节第 1 条）。
 */
export default function EditBeautyEventRoute() {
  return <EditBeautyEventScreen />;
}
