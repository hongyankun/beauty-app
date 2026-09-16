import { Stack } from 'expo-router';

/**
 * 记录 Tab 的独立导航栈。
 *
 * 目前包含列表与购买记录详情；核销历史随后续任务加入。
 */
export default function RecordsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
