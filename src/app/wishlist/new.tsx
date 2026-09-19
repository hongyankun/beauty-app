import { NewWishScreen } from '@/features/wishlist/screens/new-wish-screen';

/**
 * 路由 `/wishlist/new`：新增一条心愿。
 *
 * 与 `/purchase/new` 一样挂在根 Stack 上而不是心愿单 Tab 内，因此会覆盖 Tab 栏：
 * 表单是一次有始有终的填写，填到一半误切 Tab 就会丢内容（IA 第 4.3 节第 1 条）。
 * 页面不自己隐藏 Tab 样式，而是真的不在 Tab 的栈里。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function NewWishRoute() {
  return <NewWishScreen />;
}
