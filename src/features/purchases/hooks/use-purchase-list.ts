import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listPurchases, type PurchaseSummary } from '../services/list-purchases';

/**
 * 读取套餐列表，并在页面每次获得焦点时刷新。
 *
 * 用焦点刷新而不是一次性 effect：新增套餐是在覆盖 Tab 栏的全屏表单里完成的，
 * 保存后回到列表时这个页面并没有重新挂载，只靠挂载时拉一次会看到过期数据。
 */

export type PurchaseListStatus = 'loading' | 'ready' | 'error';

export type PurchaseListState = {
  readonly status: PurchaseListStatus;
  /** 最近一次成功读取的结果。读取失败时保留上一次的数据，继续可见（PRD-HOME-006、第 9.7 节） */
  readonly summaries: readonly PurchaseSummary[];
  readonly reload: () => void;
};

export function usePurchaseList(): PurchaseListState {
  const dataAccess = useDataAccess();
  const [summaries, setSummaries] = useState<readonly PurchaseSummary[]>([]);
  const [status, setStatus] = useState<PurchaseListStatus>('loading');

  /** 只有首次加载显示骨架；返回页面时的刷新不把已有列表换成骨架，避免闪烁。 */
  const hasLoaded = useRef(false);
  /** 自增的请求序号，只有最后一次发出的请求可以写回状态，防止乱序覆盖。 */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const rows = await listPurchases(dataAccess);
      if (requestId !== latestRequest.current) {
        return;
      }
      setSummaries(rows);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
        console.error('[purchases] 读取套餐列表失败', error);
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

  return { status, summaries, reload };
}
