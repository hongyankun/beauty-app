import type { PurchaseItemCategory } from '@/db';
import type { ArticleCategory, EncyclopediaArticle } from '@/features/catalog/types';
import type { WishlistDraftSource } from './wishlist-draft';

/**
 * 从一篇百科文章预填新增心愿表单。
 *
 * 这里是**纯函数**：不碰 React、不碰数据库、不碰导航，可以单独验证。
 *
 * 预填只是把表单的初始值填好，不建立任何长期关联：保存下来的心愿与手动
 * 新增的心愿完全一样，数据库里没有文章 slug，也没有「来自哪篇文章」的字段
 * （任务书第八节）。用户随时可以把预填的内容改掉。
 */

/**
 * 百科浏览分类 → 套餐项目分类。
 *
 * 只映射**能唯一对上**的两个，其余一律返回 null、不预填：
 *
 * - `lightAndEnergy`（光电项目）→ `light_energy`（光电类）：一一对应。
 * - `injectables`（注射项目）→ `injection`（注射类）：一一对应。
 * - `basics`（基础认知）→ 不预填：这类文章讲的是怎么看待医美，本身不是项目。
 * - `careAndSafety`（护理与安全）→ 不预填：内容混合，既覆盖光电后的护理，
 *   也覆盖注射与焕肤，猜任何一个都会有一半的时候是错的。
 *
 * 分类**只从文章的分类代码推导**，绝不从标题文字猜（任务书第 8.2 节）：
 * 「射频」出现在标题里不代表那篇文章讲的是射频项目本身。
 */
const ITEM_CATEGORY_BY_ARTICLE_CATEGORY: Readonly<
  Record<ArticleCategory, PurchaseItemCategory | null>
> = {
  basics: null,
  lightAndEnergy: 'light_energy',
  injectables: 'injection',
  careAndSafety: null,
};

/** 能唯一映射时返回对应的项目分类，否则返回 null（表示不预填分类）。 */
export function mapArticleCategoryToItemCategory(
  category: ArticleCategory,
): PurchaseItemCategory | null {
  return ITEM_CATEGORY_BY_ARTICLE_CATEGORY[category];
}

/**
 * 把一篇文章变成新增心愿的初始值。
 *
 * 只预填名称与（能唯一映射时的）分类；意向机构、计划时间、心理预算与备注
 * 一律留空——这些只有用户自己知道，凭文章猜出来的值比空着更糟。
 */
export function createWishlistSourceFromArticle(
  article: EncyclopediaArticle,
): WishlistDraftSource {
  return {
    name: article.title,
    category: mapArticleCategoryToItemCategory(article.category),
    institutionId: null,
    plannedOn: null,
    budgetMinor: null,
    notes: null,
  };
}
