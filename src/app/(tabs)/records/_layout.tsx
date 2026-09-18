import { Stack } from 'expo-router';

/**
 * 记录 Tab 的独立导航栈。
 *
 * 目前包含列表、购买记录详情与核销历史。
 */
export default function RecordsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
