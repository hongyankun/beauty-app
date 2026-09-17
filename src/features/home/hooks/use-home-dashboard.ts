import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getHomeDashboard, type HomeDashboard } from '../services/get-home-dashboard';

/**
 * 读取首页概览，并在首页每次获得焦点时重新读取数据库。
 *
 * 新增套餐、核销、撤销核销与删除套餐都发生在别的页面，完成后首页并不会重新挂载，
 * 只靠挂载时读一次会一直显示旧数字（PRD-RED-002、PRD-HOME-004）。
 */

export type HomeDashboardStatus = 'loading' | 'ready' | 'error';

export type HomeDashboardState = {
  readonly status: HomeDashboardStatus;
  /**
   * 最近一次成功读取的结果；一次都没成功过时为 null。
   *
   * 刷新失败时保留上一次的数据继续可见，只额外提示「可能不是最新」
   * （PRD-HOME-006、第 8.3 节）。
   */
  readonly dashboard: HomeDashboard | null;
  readonly reload: () => void;
};

export function useHomeDashboard(): HomeDashboardState {
  const dataAccess = useDataAccess();
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [status, setStatus] = useState<HomeDashboardStatus>('loading');

  /** 只有首次加载显示载入态；回到首页时的刷新不清空已有数字，避免整页闪烁。 */
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
      const next = await getHomeDashboard(dataAccess);
      // 慢的旧请求后到达时直接丢弃，否则它会用过期数字盖掉新结果
      // （从后台回到前台、或连续快速切换 Tab 时都可能发生）。
      if (requestId !== latestRequest.current) {
        return;
      }
      setDashboard(next);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL、表名与堆栈（PRD 第 17.6 节）。
        console.error('[home] 读取首页概览失败', error);
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
      // 离开首页时让在途请求作废，回来时会重新发起一次。
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  return { status, dashboard, reload };
}
