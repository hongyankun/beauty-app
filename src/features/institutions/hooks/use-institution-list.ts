import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import {
  listInstitutions,
  type InstitutionFilter,
  type InstitutionListResult,
} from '../services/list-institutions';

/**
 * 读取机构列表，并在页面每次获得焦点时按当前筛选刷新。
 *
 * 需要焦点刷新：从这里点进编辑页改名、归档或恢复再返回时，本页并没有重新挂载；
 * 只在挂载时读一次，列表会停在改动之前的样子。
 */

export type InstitutionListStatus = 'loading' | 'ready' | 'error';

export type InstitutionListState = {
  readonly status: InstitutionListStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的内容，继续可见 */
  readonly result: InstitutionListResult | null;
  readonly reload: () => void;
};

export function useInstitutionList(filter: InstitutionFilter): InstitutionListState {
  const dataAccess = useDataAccess();
  const [result, setResult] = useState<InstitutionListResult | null>(null);
  const [status, setStatus] = useState<InstitutionListStatus>('loading');

  /** 只有首次加载显示骨架；之后的刷新与切筛选都不把已有列表换回骨架，避免整页闪回。 */
  const hasLoaded = useRef(false);
  /**
   * 自增的请求序号，只有最后一次发出的请求可以写回状态。
   *
   * 连点两个筛选会同时有两个查询在途，慢的那个若后到就会把结果覆盖成
   * 用户已经不看的那一份（任务书第十节）。
   */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const next = await listInstitutions(dataAccess, filter);
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
        // 仅开发期输出。界面上不展示 SQL 与堆栈（任务书第十四节、PRD 第 17.6 节）。
        console.error('[institutions] 读取机构列表失败', error);
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
