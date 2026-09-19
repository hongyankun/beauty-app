import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import type { EncyclopediaArticle } from '../types';
import { CatalogServiceError } from './errors';

/**
 * 收藏 / 取消收藏一篇文章。
 *
 * 两个方向都是**幂等**的：已收藏再收藏、没收藏再取消，都不报错、
 * 也不产生第二行（任务书第六节）。存在性判断与写入放在同一个事务里，
 * 连点两次也不会一次读到「未收藏」、另一次撞上唯一约束。
 *
 * 收藏前必须核实 slug 对应一篇真实的本地文章：数据库对文章没有外键
 * （被引用的一侧根本不在数据库里），这道校验就是唯一的把关（任务书第五节）。
 * 取消收藏不做这个校验——已经改名或下线的文章，用户仍应该能把它取消掉。
 *
 * @returns 操作完成后该文章的收藏状态。
 */
export async function setArticleFavorite(
  dataAccess: DataAccess,
  articles: readonly EncyclopediaArticle[],
  input: { articleSlug: string; favorite: boolean },
): Promise<boolean> {
  const { articleSlug, favorite } = input;

  if (favorite && !articles.some((article) => article.slug === articleSlug)) {
    if (__DEV__) {
      console.error('[catalog] 试图收藏一个不存在的文章 slug', articleSlug);
    }
    throw new CatalogServiceError('没有找到这篇百科内容，它可能已经更新。');
  }

  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    if (favorite) {
      const alreadyFavorite = await repositories.catalogFavorites.exists(
        DEFAULT_PROFILE_ID,
        articleSlug,
      );
      if (alreadyFavorite) {
        return;
      }
      await repositories.catalogFavorites.insert({
        profile_id: DEFAULT_PROFILE_ID,
        article_slug: articleSlug,
        created_at: now,
      });
      return;
    }

    // DELETE 本身就是幂等的：删零行不是错误，不需要先查一次。
    await repositories.catalogFavorites.delete(DEFAULT_PROFILE_ID, articleSlug);
  });

  return favorite;
}
