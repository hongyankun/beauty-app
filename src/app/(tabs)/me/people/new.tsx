import { NewPersonScreen } from '@/features/people/screens/edit-person-screen';

/**
 * 路由 `/(tabs)/me/people/new`：添加使用人。
 *
 * 同样压在我的 Tab 的栈里，与编辑机构一致。`src/app` 只放路由。
 */
export default function NewPersonRoute() {
  return <NewPersonScreen />;
}
