import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getBeautyEventDetail, type BeautyEventDetail } from '../services/get-beauty-event-detail';

/**
 * 读取一条变美记录，并在页面每次获得焦点时刷新：编辑、撤销与修正来源都在别的页面或弹层完成，
 * 回到详情页时它并没有重新挂载。
 */

export type BeautyEventDetailStatus = 'loading' | 'ready' | 'notFound' | 'error';

export type BeautyEventDetailState = {
  readonly status: BeautyEventDetailStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的数据 */
  readonly detail: BeautyEventDetail | null;
  readonly reload: () => void;
};

export function useBeautyEventDetail(eventId: string): BeautyEventDetailState {
  const dataAccess = useDataAccess();
  const [detail, setDetail] = useState<BeautyEventDetail | null>(null);
  const [status, setStatus] = useState<BeautyEventDetailStatus>('loading');
  const hasLoaded = useRef(false);
  /** 自增的请求序号，只有最后一次发出的请求可以写回状态；离开页面时作废在途请求。 */
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    if (!hasLoaded.current) {
      setStatus('loading');
    }
    try {
      const result = await getBeautyEventDetail(dataAccess, eventId);
      if (requestId !== latestRequest.current) {
        return;
      }
      hasLoaded.current = true;
      setDetail(result);
      setStatus(result === null ? 'notFound' : 'ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        console.error('[events] 读取变美记录失败', error instanceof Error ? error.name : typeof error);
      }
      setStatus('error');
    }
  }, [dataAccess, eventId]);

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

  return { status, detail, reload };
}
