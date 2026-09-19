import { Stack } from 'expo-router';

/**
 * 心愿单 Tab 的独立导航栈。
 *
 * 栈里有两页：列表页（心愿项目 / 收藏文章两个视图），以及从收藏文章打开的
 * 百科详情 `article/[entryId]`。后者渲染的是百科 Tab 里那一个
 * `ArticleDetailScreen`，只是挂在本栈上，好让所有返回方式都落回收藏列表。
 *
 * 新增与编辑心愿是全屏表单，挂在根 Stack 上覆盖 Tab 栏
 * （`/wishlist/new`、`/wishlist/[wishId]/edit`，IA 第 4.3 节第 1 条），
 * 不在这个栈里。
 */
export default function WishlistStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
