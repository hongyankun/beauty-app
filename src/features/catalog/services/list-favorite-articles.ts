import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { toFavoriteArticleSummary, type FavoriteArticleSummary } from '../favorites-view';
import type { EncyclopediaArticle } from '../types';

/**
 * 收藏文章列表用例。
 *
 * 数据库里存的只有 slug，这里再回本地文章集把标题、摘要与分类解析出来
 * （任务书第五节）。顺序由 repository 的 SQL 决定（收藏时间倒序），
 * 这里不二次排序，避免两处各排一套。
 *
 * **孤儿 slug**（文章已经改名或下线，本地内容里查不到）会被安全忽略：
 * 不崩溃，也绝不渲染一张只有 slug 的假卡片。本轮不自动清理这些行——
 * 内容更新与数据清理是两件事，静默删用户的收藏比留着更糟。
 */
export async function listFavoriteArticles(
  dataAccess: DataAccess,
  articles: readonly EncyclopediaArticle[],
): Promise<FavoriteArticleSummary[]> {
  const rows = await dataAccess.catalogFavorites.listByProfile(DEFAULT_PROFILE_ID);
  const bySlug = new Map(articles.map((article) => [article.slug, article]));

  const summaries: FavoriteArticleSummary[] = [];
  for (const row of rows) {
    const article = bySlug.get(row.article_slug);
    if (article === undefined) {
      if (__DEV__) {
        console.error('[catalog] 收藏指向的文章不存在，已跳过', row.article_slug);
      }
      continue;
    }
    summaries.push(toFavoriteArticleSummary(article));
  }
  return summaries;
}
