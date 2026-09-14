import { Stack } from 'expo-router';

/**
 * 首页 Tab 的独立导航栈。
 *
 * 每个一级 Tab 拥有自己的栈（docs/INFORMATION_ARCHITECTURE.md 第 1 节），
 * 详情页随后续任务加入。本轮页面自带标题排版，因此不显示导航栏。
 */
export default function HomeStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
