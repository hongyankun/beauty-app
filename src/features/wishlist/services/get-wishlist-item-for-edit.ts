import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { toWishlistItemSummary, type WishlistItemSummary } from '../wishlist-view';

/**
 * 读取一条心愿用于编辑。
 *
 * 不存在、已被删除，或不属于当前档案时一律返回 null——三种情况对用户是同一句话
 * 「找不到这个心愿」，service 不去区分，也不把「存在但不属于你」这个事实透出去。
 *
 * 返回值带机构的**当前**名称与归档状态：机构归档后既有关联仍然保留，
 * 编辑页要照常显示它，并说明它已归档（任务书第六节第 4 条）。
 */
export async function getWishlistItemForEdit(
  dataAccess: DataAccess,
  wishlistItemId: string,
): Promise<WishlistItemSummary | null> {
  const row = await dataAccess.wishlist.findById(DEFAULT_PROFILE_ID, wishlistItemId);
  return row === null ? null : toWishlistItemSummary(row);
}
