import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { ARTICLES } from '../data';
import type { FavoriteArticleSummary } from '../favorites-view';
import { listFavoriteArticles } from '../services/list-favorite-articles';

/**
 * 读取收藏文章列表，并在页面每次获得焦点时刷新。
 *
 * 需要焦点刷新：从这里点进文章详情取消收藏再返回时，本页并没有重新挂载；
 * 只在挂载时读一次，列表里会留着一张已经取消掉的卡片（任务书第 9.2 节）。
 *
 * 与 `useWishlistList` 是同一套并发与错误约定：首次加载才显示骨架、
 * 过期请求直接丢弃、读取失败保留上一次的内容。
 */

export type FavoriteArticlesStatus = 'loading' | 'ready' | 'error';

export type FavoriteArticlesState = {
  readonly status: FavoriteArticlesStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的内容，继续可见 */
  readonly articles: readonly FavoriteArticleSummary[] | null;
  readonly reload: () => void;
};

export function useFavoriteArticles(): FavoriteArticlesState {
  const dataAccess = useDataAccess();
  const [articles, setArticles] = useState<readonly FavoriteArticleSummary[] | null>(null);
  const [status, setStatus] = useState<FavoriteArticlesStatus>('loading');

  const hasLoaded = useRef(false);
  /** 自增的请求序号，只有最后一次发出的请求可以写回状态。 */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const next = await listFavoriteArticles(dataAccess, ARTICLES);
      if (requestId !== latestRequest.current) {
        return;
      }
      setArticles(next);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（任务书第六节、PRD 第 17.6 节）。
        console.error('[catalog] 读取收藏文章失败', error);
      }
      setStatus('error');
    }
  }, [dataAccess]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  return { status, articles, reload };
}
