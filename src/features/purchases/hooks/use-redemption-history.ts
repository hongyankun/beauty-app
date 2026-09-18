import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import {
  listRedemptionHistory,
  type RedemptionHistoryFilter,
  type RedemptionHistoryResult,
} from '../services/list-redemption-history';

/**
 * 读取完整核销历史，并在页面每次获得焦点时按当前筛选刷新。
 *
 * 需要焦点刷新的原因和列表页一样：从这里点进套餐详情、在那边撤销一条核销
 * 再返回时，本页并没有重新挂载；只在挂载时读一次，那条记录会一直显示成「有效」
 * （任务书第十节）。
 */

export type RedemptionHistoryStatus = 'loading' | 'ready' | 'error';

export type RedemptionHistoryState = {
  readonly status: RedemptionHistoryStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的内容，继续可见 */
  readonly result: RedemptionHistoryResult | null;
  readonly reload: () => void;
};

export function useRedemptionHistory(filter: RedemptionHistoryFilter): RedemptionHistoryState {
  const dataAccess = useDataAccess();
  const [result, setResult] = useState<RedemptionHistoryResult | null>(null);
  const [status, setStatus] = useState<RedemptionHistoryStatus>('loading');

  /** 只有首次加载显示骨架；之后的刷新与切筛选都不把已有列表换回骨架，避免整页闪回。 */
  const hasLoaded = useRef(false);
  /**
   * 自增的请求序号，只有最后一次发出的请求可以写回状态。
   *
   * 这里比列表页更要紧：连续点三个筛选会同时有三个查询在途，
   * 慢的那个若后到就会把结果覆盖成用户已经不看的那一份（任务书第十节）。
   */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const next = await listRedemptionHistory(dataAccess, filter);
      if (requestId !== latestRequest.current) {
        return;
      }
      setResult(next);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
        console.error('[purchases] 读取核销历史失败', error);
      }
      setStatus('error');
    }
  }, [dataAccess, filter]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useFocusEffect(
    // `load` 随筛选变化，所以切筛选时这个 effect 也会重跑一次——
    // 切换筛选与返回页面走的是同一条刷新路径，不需要第二个 effect。
    useCallback(() => {
      void load();
      // 离开页面时让在途请求作废，回来时会重新发起一次。
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  return { status, result, reload };
}
