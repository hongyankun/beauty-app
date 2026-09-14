import { Stack } from 'expo-router';

/**
 * 记录 Tab 的独立导航栈。
 *
 * 购买记录详情与核销历史随后续任务加入，本轮只有列表页。
 */
export default function RecordsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
