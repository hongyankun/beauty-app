import { EditInstitutionScreen } from '@/features/institutions/screens/edit-institution-screen';

/**
 * 路由 `/(tabs)/me/institutions/[institutionId]`：编辑一个机构。
 *
 * 同样压在我的 Tab 的栈里，保留 Tab 栏。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function EditInstitutionRoute() {
  return <EditInstitutionScreen />;
}
