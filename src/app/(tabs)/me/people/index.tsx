import { PersonListScreen } from '@/features/people/screens/person-list-screen';

/**
 * 路由 `/(tabs)/me/people`：使用人管理。
 *
 * 压在我的 Tab 自己的栈里，保留 Tab 栏。`src/app` 只放路由（ARCHITECTURE 第六节）。
 */
export default function PersonListRoute() {
  return <PersonListScreen />;
}
