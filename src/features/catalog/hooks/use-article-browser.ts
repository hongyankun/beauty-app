import { useCallback, useMemo, useState } from 'react';

import { ARTICLES } from '../data';
import { searchArticles, type CategoryFilter } from '../services/search-articles';
import type { EncyclopediaArticle } from '../types';

export type ArticleBrowser = {
  keyword: string;
  setKeyword: (keyword: string) => void;
  category: CategoryFilter;
  setCategory: (category: CategoryFilter) => void;
  /** 当前关键词与分类下的结果，保持编辑顺序 */
  results: readonly EncyclopediaArticle[];
  /** 是否有任何筛选条件生效，用于决定空状态给不给「清除筛选」 */
  hasFilters: boolean;
  clearFilters: () => void;
  /** 全集是否为空。区别于「筛选后为空」，两者的空状态文案不同 */
  isLibraryEmpty: boolean;
};

/**
 * 百科首页的浏览状态。
 *
 * 内容是本地只读数据，没有异步加载，也没有失败态：不需要 loading、
 * error 与重试。这里只负责把关键词、分类与筛选结果串起来。
 * 搜索词不做任何持久化，退出页面即丢弃（任务书第十节）。
 */
export function useArticleBrowser(): ArticleBrowser {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const results = useMemo(
    () => searchArticles(ARTICLES, { keyword, category }),
    [keyword, category],
  );

  const clearFilters = useCallback(() => {
    setKeyword('');
    setCategory('all');
  }, []);

  return {
    keyword,
    setKeyword,
    category,
    setCategory,
    results,
    hasFilters: keyword.trim().length > 0 || category !== 'all',
    clearFilters,
    isLibraryEmpty: ARTICLES.length === 0,
  };
}
