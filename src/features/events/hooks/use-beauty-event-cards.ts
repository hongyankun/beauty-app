import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import type { BeautyEventCard } from '../event-summary';
import { listBeautyEventCards } from '../services/list-beauty-events';

/**
 * 读取变美历史（全部变美记录），并在页面每次获得焦点时刷新（BT-0024）。
 *
 * 新建、编辑、撤销、修正来源与删除都在别的页面完成，回到列表时它没有重新挂载，所以靠焦点刷新。
 * 只有首次加载显示骨架；读取失败保留上一次的数据；自增请求序号防止旧请求覆盖新结果，
 * 离开页面时作废在途请求，卸载后不再写状态。
 */

export type BeautyEventCardsState = {
  readonly status: 'loading' | 'ready' | 'error';
  readonly cards: readonly BeautyEventCard[];
  readonly reload: () => void;
};

export function useBeautyEventCards(): BeautyEventCardsState {
  const dataAccess = useDataAccess();
  const [cards, setCards] = useState<readonly BeautyEventCard[]>([]);
  const [status, setStatus] = useState<BeautyEventCardsState['status']>('loading');
  const hasLoaded = useRef(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    if (!hasLoaded.current) {
      setStatus('loading');
    }
    try {
      const result = await listBeautyEventCards(dataAccess, null);
      if (requestId !== latestRequest.current) {
        return;
      }
      setCards(result);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        console.error('[events] 读取变美历史失败', error instanceof Error ? error.name : typeof error);
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

  return { status, cards, reload };
}
