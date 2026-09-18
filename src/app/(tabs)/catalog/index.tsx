import { CatalogHomeScreen } from '@/features/catalog/screens/catalog-home-screen';

/**
 * 路由 `/(tabs)/catalog`：百科首页。
 *
 * 路由内部名称为 `catalog`，界面上一律显示「百科」。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function CatalogHomeRoute() {
  return <CatalogHomeScreen />;
}
