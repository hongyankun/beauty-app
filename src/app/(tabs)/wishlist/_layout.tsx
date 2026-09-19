import { Stack } from 'expo-router';

/**
 * 心愿单 Tab 的独立导航栈。
 *
 * 栈里只有列表页：新增与编辑是全屏表单，挂在根 Stack 上覆盖 Tab 栏
 * （`/wishlist/new`、`/wishlist/[wishId]/edit`，IA 第 4.3 节第 1 条），
 * 不在这个栈里。收藏列表随百科收藏一起加入（R3）。
 */
export default function WishlistStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
