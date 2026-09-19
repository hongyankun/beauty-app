import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import type { WishlistDraftInput } from '../wishlist-draft';
import { WishlistServiceError } from './errors';
import { assertWishlistInputIsValid } from './wishlist-input-rules';

/**
 * 编辑心愿用例。
 *
 * `id` 与 `created_at` 不在可写列内，只有 `updated_at` 随每次保存推进。
 */

const MISSING_MESSAGE = '找不到这个心愿，它可能已经被删除了。';

export async function updateWishlistItem(
  dataAccess: DataAccess,
  wishlistItemId: string,
  input: WishlistDraftInput,
): Promise<void> {
  assertWishlistInputIsValid(input);

  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新确认这条心愿存在且属于当前档案。页面上那份数据可能是
    //    几分钟前读的，期间它可能已经在别处被删掉了。
    const existing = await repositories.wishlist.findById(DEFAULT_PROFILE_ID, wishlistItemId);
    if (existing === null) {
      throw new WishlistServiceError(MISSING_MESSAGE);
    }

    // 2. 机构同样重新确认归属，不接受不属于本档案的 ID。
    if (input.institutionId !== null) {
      const institution = await repositories.institutions.findById(
        DEFAULT_PROFILE_ID,
        input.institutionId,
      );
      if (institution === null) {
        throw new WishlistServiceError('选择的机构已经不存在了，请重新选择');
      }
    }

    const changed = await repositories.wishlist.update({
      id: wishlistItemId,
      profile_id: DEFAULT_PROFILE_ID,
      name: input.name.trim(),
      category: input.category,
      institution_id: input.institutionId,
      planned_on: input.plannedOn,
      budget_minor: input.budgetMinor,
      notes: input.notes,
      updated_at: now,
    });

    // 3. 更新行数必须正好是 1。0 表示这条心愿刚刚已被删除；抛出让事务回滚，
    //    不留下「以为改成功了其实什么都没写」的假象。
    if (changed !== 1) {
      throw new WishlistServiceError(MISSING_MESSAGE);
    }
  });
}
