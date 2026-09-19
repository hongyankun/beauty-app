import { CATEGORY_NAMES, type ArticleCategory, type EncyclopediaArticle } from './types';

/**
 * 收藏的文章 → 页面可直接渲染的视图模型。
 *
 * 标题、摘要与分类**一律来自本地文章内容**，不来自数据库：数据库里只有
 * 一个 slug（任务书第 4.1 节）。文章内容随 App 更新后，收藏列表跟着显示
 * 新文本，不会留下一份过时的副本。
 */
export type FavoriteArticleSummary = {
  /** 稳定 slug，同时是列表 key 与跳转详情用的路由参数 */
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: ArticleCategory;
  /** 分类的中文名，卡片上显示 */
  readonly categoryLabel: string;
};

export function toFavoriteArticleSummary(article: EncyclopediaArticle): FavoriteArticleSummary {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: article.category,
    categoryLabel: CATEGORY_NAMES[article.category],
  };
}
