import { BeautyEventDetailScreen } from '@/features/events/screens/beauty-event-detail-screen';

/**
 * 路由 `/(tabs)/records/event/[eventId]`：变美记录详情（BT-0023 裁决 3，操作闭环所需的最小详情）。
 *
 * 压在记录 Tab 自己的栈里，保留 Tab 栏（IA 第 4.3 节第 2 条）。
 */
export default function BeautyEventDetailRoute() {
  return <BeautyEventDetailScreen />;
}
