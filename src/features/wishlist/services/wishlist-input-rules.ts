import { PURCHASE_ITEM_CATEGORIES } from '@/db';
import { parseBusinessDate } from '@/utils/business-date';
import { MAX_AMOUNT_MINOR } from '@/utils/money';
import type { WishlistDraftInput } from '../wishlist-draft';
import { WishlistServiceError } from './errors';

/**
 * 心愿写入前的兜底校验，新增与编辑共用。
 *
 * 表单已经校验过一遍，这里再校验一遍不是重复劳动：service 是业务规则的归属层，
 * 换一个调用方（将来的导入、从百科直接加入心愿）时这些规则仍然必须成立
 * （ARCHITECTURE 第三节、任务书第五节第 4 条）。
 *
 * 表上的 CHECK 是最后一道防线，但它给出的是英文约束错误，不能直接展示给用户；
 * 这里先用中文业务语言把非法输入挡下来。
 */
export function assertWishlistInputIsValid(input: WishlistDraftInput): void {
  if (input.name.trim() === '') {
    throw new WishlistServiceError('请填写心愿名称');
  }

  // 分类复用套餐项目的取值，不接受这份清单以外的任何 code。
  if (input.category !== null && !PURCHASE_ITEM_CATEGORIES.includes(input.category)) {
    throw new WishlistServiceError('项目分类不在可选范围内');
  }

  // 计划日期允许早于今天，但必须是日历上真实存在的一天。
  if (input.plannedOn !== null && !parseBusinessDate(input.plannedOn).ok) {
    throw new WishlistServiceError('计划日期不是一个有效的日期');
  }

  if (input.budgetMinor !== null) {
    if (!Number.isInteger(input.budgetMinor)) {
      throw new WishlistServiceError('预算必须是有效金额');
    }
    if (input.budgetMinor < 0) {
      throw new WishlistServiceError('预算不能为负数');
    }
    if (input.budgetMinor > MAX_AMOUNT_MINOR) {
      throw new WishlistServiceError('预算过大，请检查是否输入有误');
    }
  }
}
