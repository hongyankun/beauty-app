import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';

/**
 * 查询一篇文章当前是否已被收藏。
 *
 * 只回答「收了 / 没收」这一个事实，按当前档案隔离（ADR-007、ADR-015）。
 * 这里不校验 slug 是否对应真实文章：查询一个不存在的 slug 只会得到 false，
 * 没有副作用；真正需要拦住无效 slug 的是写入（见 `setArticleFavorite`）。
 */
export async function getArticleFavoriteStatus(
  dataAccess: DataAccess,
  articleSlug: string,
): Promise<boolean> {
  return dataAccess.catalogFavorites.exists(DEFAULT_PROFILE_ID, articleSlug);
}
