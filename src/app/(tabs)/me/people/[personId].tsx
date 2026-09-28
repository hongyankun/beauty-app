import { EditPersonScreen } from '@/features/people/screens/edit-person-screen';

/**
 * 路由 `/(tabs)/me/people/[personId]`：查看或编辑一个使用人。
 *
 * 同样压在我的 Tab 的栈里，保留 Tab 栏。`src/app` 只放路由。
 */
export default function EditPersonRoute() {
  return <EditPersonScreen />;
}
