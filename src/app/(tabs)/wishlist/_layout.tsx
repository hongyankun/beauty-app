import { Stack } from 'expo-router';

/**
 * 心愿单 Tab 的独立导航栈。
 *
 * 心愿详情、新增编辑与收藏列表随后续任务加入，本轮只有列表页。
 */
export default function WishlistStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
