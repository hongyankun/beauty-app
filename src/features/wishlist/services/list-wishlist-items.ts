import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { toWishlistItemSummary, type WishlistItemSummary } from '../wishlist-view';

/**
 * 心愿单列表用例。
 *
 * 只读当前档案的心愿（数据按 Account / Profile 隔离，ADR-007、ADR-015）。
 * 排序由 repository 的 SQL 决定，这里不再二次排序，避免两处各排一套。
 */
export async function listWishlistItems(dataAccess: DataAccess): Promise<WishlistItemSummary[]> {
  const rows = await dataAccess.wishlist.listByProfile(DEFAULT_PROFILE_ID);
  return rows.map(toWishlistItemSummary);
}
