import type { EncyclopediaArticle } from '../types';

/**
 * 按路由参数查找文章。
 *
 * 路由上带的是文章的 slug（可读、稳定）。同时接受 id，是为了让早期
 * 写死 id 的入口和外部深链也能落到正确的文章上；两者都唯一，不会撞车。
 *
 * 找不到时返回 `undefined`，由页面给出安全状态，不抛错。
 */
export function findArticle(
  articles: readonly EncyclopediaArticle[],
  entryId: string | undefined,
): EncyclopediaArticle | undefined {
  if (entryId === undefined || entryId.length === 0) {
    return undefined;
  }
  return articles.find((article) => article.slug === entryId || article.id === entryId);
}
