import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { createUuid } from '@/utils/uuid';
import type { WishlistDraftInput } from '../wishlist-draft';
import { WishlistServiceError } from './errors';
import { assertWishlistInputIsValid } from './wishlist-input-rules';

/**
 * 新增心愿用例。
 *
 * 只写 `wishlist_items` 一张表，但仍然走事务：意向机构要在同一个事务里
 * 重新确认一次归属与存在，否则可能写进一个不属于本档案的 `institution_id`。
 *
 * 心愿是用户主动记下的关注对象，这里不做任何推荐、判断或医学评估（ADR-009）。
 */
export async function createWishlistItem(
  dataAccess: DataAccess,
  input: WishlistDraftInput,
): Promise<string> {
  assertWishlistInputIsValid(input);

  const now = new Date().toISOString();

  return dataAccess.transaction(async (repositories) => {
    // 机构只能引用已有机构，不在心愿表单里新建（任务书第六节第 1 条）。
    // 归档的机构不出现在选择列表里，但这里不拒绝已归档的 ID：
    // 用户可能在页面停留期间被归档，那也不该让保存失败。
    if (input.institutionId !== null) {
      const institution = await repositories.institutions.findById(
        DEFAULT_PROFILE_ID,
        input.institutionId,
      );
      if (institution === null) {
        throw new WishlistServiceError('选择的机构已经不存在了，请重新选择');
      }
    }

    const id = createUuid();
    await repositories.wishlist.insert({
      id,
      profile_id: DEFAULT_PROFILE_ID,
      name: input.name.trim(),
      category: input.category,
      institution_id: input.institutionId,
      planned_on: input.plannedOn,
      budget_minor: input.budgetMinor,
      notes: input.notes,
      created_at: now,
      updated_at: now,
    });

    return id;
  });
}
