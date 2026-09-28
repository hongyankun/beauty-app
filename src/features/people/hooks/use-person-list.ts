import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listPeople, type PersonFilter, type PersonListResult } from '../services/list-people';

/**
 * 读取使用人列表，并在页面每次获得焦点时按当前筛选刷新。
 *
 * 与机构列表同一套写法：从编辑页改名、归档、恢复或删除再返回时本页没有重新挂载，
 * 需要焦点刷新；自增请求序号保证慢请求后到时不会覆盖当前筛选的结果。
 */

export type PersonListStatus = 'loading' | 'ready' | 'error';

export type PersonListState = {
  readonly status: PersonListStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的内容 */
  readonly result: PersonListResult | null;
  readonly reload: () => void;
};

export function usePersonList(filter: PersonFilter): PersonListState {
  const dataAccess = useDataAccess();
  const [result, setResult] = useState<PersonListResult | null>(null);
  const [status, setStatus] = useState<PersonListStatus>('loading');
  const hasLoaded = useRef(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (!hasLoaded.current) {
      setStatus('loading');
    }

    try {
      const next = await listPeople(dataAccess, filter);
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
        console.error('[people] 读取使用人列表失败', error);
      }
      setStatus('error');
    }
  }, [dataAccess, filter]);

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

  return { status, result, reload };
}
