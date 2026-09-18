import { Stack } from 'expo-router';

/**
 * 百科 Tab 的独立导航栈。
 *
 * 路由内部名称为 `catalog`，界面上一律显示「百科」。
 * 本轮有首页与文章详情两个页面；搜索做在首页内，暂不单独建搜索路由。
 */
export default function CatalogStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
