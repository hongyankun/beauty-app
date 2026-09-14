import { Stack } from 'expo-router';

/**
 * 百科 Tab 的独立导航栈。
 *
 * 路由内部名称为 `catalog`，界面上一律显示「百科」。
 * 搜索页与条目详情随后续任务加入，本轮只有首页。
 */
export default function CatalogStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
