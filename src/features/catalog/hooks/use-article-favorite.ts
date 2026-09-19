import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { ARTICLES } from '../data';
import { getArticleFavoriteStatus } from '../services/get-article-favorite-status';
import { setArticleFavorite } from '../services/set-article-favorite';
import { toUserMessage } from '../services/errors';

/**
 * 一篇文章的收藏状态与切换动作。
 *
 * 状态在页面每次获得焦点时重新读一次：同一篇文章可能刚从收藏列表那边
 * 被取消掉，再回到详情页时按钮不能还写着「已收藏」（任务书第 7.1 节）。
 *
 * 这里不写 SQL，也不 import expo-sqlite：读写全部发生在 service 层
 * （ARCHITECTURE 第三节）。
 */

const TOGGLE_ON_FALLBACK = '没能收藏这篇文章，请重试。';
const TOGGLE_OFF_FALLBACK = '没能取消收藏，请重试。';

export type ArticleFavoriteController = {
  readonly isFavorite: boolean;
  /** 首次状态是否已经读到。读到之前按钮不可点，避免用户对着一个猜出来的状态操作 */
  readonly ready: boolean;
  /** 写入进行中。按钮显示进行中态并禁用 */
  readonly pending: boolean;
  /** 失败时的中文说明；没有问题时为 null */
  readonly errorMessage: string | null;
  readonly toggle: () => void;
};

export function useArticleFavorite(articleSlug: string | null): ArticleFavoriteController {
  const dataAccess = useDataAccess();
  const [isFavorite, setIsFavorite] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 写入闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住
   * （任务书第 7.1 节：不能只依赖按钮禁用）。
   */
  const busy = useRef(false);
  /** 自增的请求序号，只有最后一次发出的读取可以写回状态。 */
  const latestRead = useRef(0);

  const load = useCallback(async () => {
    if (articleSlug === null) {
      return;
    }
    // 写入在飞时不要用一次读取把乐观结果覆盖回去。
    if (busy.current) {
      return;
    }

    latestRead.current += 1;
    const requestId = latestRead.current;

    try {
      const next = await getArticleFavoriteStatus(dataAccess, articleSlug);
      if (requestId !== latestRead.current) {
        return;
      }
      setIsFavorite(next);
      setReady(true);
    } catch (error) {
      if (requestId !== latestRead.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（任务书第六节、PRD 第 17.6 节）。
        console.error('[catalog] 读取收藏状态失败', error);
      }
      // 读不到状态时不谎报「未收藏」：按钮保持不可用，正文照常可读。
      setErrorMessage('没能读取收藏状态，稍后再试。');
    }
  }, [articleSlug, dataAccess]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        latestRead.current += 1;
      };
    }, [load]),
  );

  const toggle = useCallback(() => {
    if (articleSlug === null || busy.current || !ready) {
      return;
    }

    const next = !isFavorite;
    busy.current = true;
    setPending(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const result = await setArticleFavorite(dataAccess, ARTICLES, {
          articleSlug,
          favorite: next,
        });
        setIsFavorite(result);
      } catch (error) {
        // 失败时状态保持原样，不假装成功（任务书第 7.1 节）。
        setErrorMessage(toUserMessage(error, next ? TOGGLE_ON_FALLBACK : TOGGLE_OFF_FALLBACK));
      } finally {
        busy.current = false;
        setPending(false);
      }
    })();
  }, [articleSlug, dataAccess, isFavorite, ready]);

  return { isFavorite, ready, pending, errorMessage, toggle };
}
