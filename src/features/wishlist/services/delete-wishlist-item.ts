import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { WishlistServiceError } from './errors';

/**
 * 心愿永久删除用例。
 *
 * 用户二次确认后就是真正的 DELETE：没有软删除、没有回收站、没有恢复入口
 * （与套餐删除同一口径，ADR-016）。心愿不被任何其他表引用，
 * 删除不会波及机构、套餐与核销记录。
 */

const MISSING_MESSAGE = '找不到这个心愿，它可能已经被删除了。';

export async function deleteWishlistItem(
  dataAccess: DataAccess,
  wishlistItemId: string,
): Promise<void> {
  const deleted = await dataAccess.wishlist.deletePermanently(DEFAULT_PROFILE_ID, wishlistItemId);

  // 删 0 行意味着它不存在、已被删除，或不属于当前档案。这三种情况都不能
  // 静默当成成功：界面必须说出来，而不是回到列表让用户以为删掉了什么
  // （任务书第五节第 7 条）。
  if (deleted !== 1) {
    throw new WishlistServiceError(MISSING_MESSAGE);
  }
}
