import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listWishlistItems } from '../services/list-wishlist-items';
import type { WishlistItemSummary } from '../wishlist-view';

/**
 * 读取心愿单列表，并在页面每次获得焦点时刷新。
 *
 * 需要焦点刷新：从这里点进编辑页改内容或删除再返回时，本页并没有重新挂载；
 * 只在挂载时读一次，列表会停在改动之前的样子（任务书第八节第 5 条）。
 */

export type WishlistListStatus = 'loading' | 'ready' | 'error';

export type WishlistListState = {
  readonly status: WishlistListStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的内容，继续可见 */
  readonly items: readonly WishlistItemSummary[] | null;
  readonly reload: () => void;
};

export function useWishlistList(): WishlistListState {
  const dataAccess = useDataAccess();
  const [items, setItems] = useState<readonly WishlistItemSummary[] | null>(null);
  const [status, setStatus] = useState<WishlistListStatus>('loading');

  /** 只有首次加载显示骨架；之后的刷新不把已有列表换回骨架，避免整页闪回。 */
  const hasLoaded = useRef(false);
  /**
   * 自增的请求序号，只有最后一次发出的请求可以写回状态。
   *
   * 快速来回切页会同时有两个查询在途，慢的那个若后到就会把结果覆盖成
   * 用户已经不看的那一份（任务书第八节第 6 条）。
   */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const next = await listWishlistItems(dataAccess);
      if (requestId !== latestRequest.current) {
        return;
      }
      setItems(next);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（任务书第八节、PRD 第 17.6 节）。
        console.error('[wishlist] 读取心愿单失败', error);
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
      // 离开页面时让在途请求作废，回来时会重新发起一次。
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  return { status, items, reload };
}
