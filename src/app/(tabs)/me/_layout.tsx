import { Stack } from 'expo-router';

/**
 * 我的 Tab 的独立导航栈。
 *
 * 数据管理、隐私与安全、关于与免责声明等设置页随后续任务加入，本轮只有入口页。
 */
export default function MeStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
