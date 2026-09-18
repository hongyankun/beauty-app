import { InstitutionListScreen } from '@/features/institutions/screens/institution-list-screen';

/**
 * 路由 `/(tabs)/me/institutions`：机构管理中心。
 *
 * 压在我的 Tab 自己的栈里，保留 Tab 栏，不产生第二个 Tab（IA 第 4.3 节第 2 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function InstitutionListRoute() {
  return <InstitutionListScreen />;
}
