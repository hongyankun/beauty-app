import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { todayBusinessDate } from '@/utils/business-date';
import {
  listExpiringPurchases,
  type ExpiringPurchaseResult,
} from '../services/list-expiring-purchases';

/**
 * 读取临期与已过期套餐，并在页面每次获得焦点时重新读取数据库。
 *
 * 新增套餐、改有效期、核销、撤销核销与删除套餐都发生在别的页面，
 * 回到首页或提醒页时不会重新挂载，只靠挂载时读一次会一直显示旧结果
 * （任务书第十一节）。
 *
 * 「今天」在每次读取时现取设备本地日历：App 长时间挂在后台跨了一天，
 * 回到前台重新获得焦点就会用新的今天重算，不会把昨天的判断留在屏幕上。
 */

export type ExpiringPurchasesStatus = 'loading' | 'ready' | 'error';

export type ExpiringPurchasesState = {
  readonly status: ExpiringPurchasesStatus;
  /**
   * 最近一次成功读取的结果；一次都没成功过时为 null。
   *
   * 刷新失败时保留上一次的结果继续可见，只额外提示「可能不是最新」
   * （任务书第十二节）。
   */
  readonly result: ExpiringPurchaseResult | null;
  readonly reload: () => void;
};

export function useExpiringPurchases(): ExpiringPurchasesState {
  const dataAccess = useDataAccess();
  const [result, setResult] = useState<ExpiringPurchaseResult | null>(null);
  const [status, setStatus] = useState<ExpiringPurchasesStatus>('loading');

  /** 只有首次加载显示载入态；回到页面时的刷新不清空已有内容，避免整块闪成骨架。 */
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
      const next = await listExpiringPurchases(dataAccess, todayBusinessDate());
      // 慢的旧请求后到达时直接丢弃，否则它会用过期结果盖掉新结果。
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
        // 仅开发期输出。界面上不展示 SQL、表名与堆栈（PRD 第 17.6 节）。
        console.error('[home] 读取临期提醒失败', error);
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

  return { status, result, reload };
}
