import type { ArticleCategory, EncyclopediaArticle } from '../types';

/** 分类筛选的取值：`all` 表示不限分类。 */
export type CategoryFilter = ArticleCategory | 'all';

/**
 * 把用户输入的关键词切成若干个检索词。
 *
 * 去首尾空格、把连续空白折叠成一个分隔符、英文统一转小写。
 * 中文不做分词，按原样参与包含匹配（任务书第十节）。
 */
export function normalizeKeyword(keyword: string): string[] {
  const trimmed = keyword.trim().toLowerCase();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split(/\s+/u);
}

/** 一篇文章参与搜索的全部字段：标题、摘要、标签、别名。 */
function haystackOf(article: EncyclopediaArticle): string[] {
  return [article.title, article.summary, ...article.tags, ...article.aliases].map((value) =>
    value.toLowerCase(),
  );
}

/**
 * 多词之间是「与」的关系：每个词都要命中，但允许分别命中不同字段
 * （例如「射频 紧致」可以一个命中标题、一个命中标签）。
 */
function matchesTerms(article: EncyclopediaArticle, terms: readonly string[]): boolean {
  if (terms.length === 0) {
    return true;
  }
  const haystack = haystackOf(article);
  return terms.every((term) => haystack.some((field) => field.includes(term)));
}

/**
 * 按关键词与分类筛选文章。
 *
 * 纯函数，不做相关性评分：结果保持 `ARTICLES` 的编辑顺序，
 * 这样同一组条件下的顺序永远稳定，也不会出现「谁排前面」的隐性推荐。
 * 关键词与分类同时生效。
 */
export function searchArticles(
  articles: readonly EncyclopediaArticle[],
  options: { keyword: string; category: CategoryFilter },
): EncyclopediaArticle[] {
  const terms = normalizeKeyword(options.keyword);
  return articles.filter(
    (article) =>
      (options.category === 'all' || article.category === options.category) &&
      matchesTerms(article, terms),
  );
}
