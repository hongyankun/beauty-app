import { EditWishScreen } from '@/features/wishlist/screens/edit-wish-screen';

/**
 * 路由 `/wishlist/[wishId]/edit`：编辑一条心愿，并在这里永久删除它。
 *
 * 首版没有单独的心愿详情页：一条心愿总共五个字段，
 * 「看」和「改」拆成两页只会多一次点击，卡片上已经能看到全部内容。
 * 因此点击列表卡片直接到这一页。
 *
 * 与 `/purchase/[purchaseId]/edit` 一样挂在根 Stack 上，覆盖 Tab 栏，
 * 避免填写途中误切 Tab 丢失内容（IA 第 4.3 节第 1 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function EditWishRoute() {
  return <EditWishScreen />;
}
