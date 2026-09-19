import { WishlistListScreen } from '@/features/wishlist/screens/wishlist-list-screen';

/**
 * 路由 `/(tabs)/wishlist`：心愿单列表，心愿单 Tab 的一级页面。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function WishlistRoute() {
  return <WishlistListScreen />;
}
