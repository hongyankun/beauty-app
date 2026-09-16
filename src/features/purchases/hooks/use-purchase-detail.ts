import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getPurchaseDetail, type PurchaseDetail } from '../services/get-purchase-detail';

/**
 * 读取单个套餐的详情，并在页面每次获得焦点时刷新。
 *
 * 核销是在覆盖 Tab 栏的全屏表单里完成的，保存后回到详情页时这个页面并没有
 * 重新挂载。只在挂载时读一次，余次就会停在核销之前的数字（任务书第十二节）。
 */

export type PurchaseDetailStatus = 'loading' | 'ready' | 'notFound' | 'error';

export type PurchaseDetailState = {
  readonly status: PurchaseDetailStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的数据，继续可见 */
  readonly detail: PurchaseDetail | null;
  readonly reload: () => void;
};

export function usePurchaseDetail(purchaseId: string): PurchaseDetailState {
  const dataAccess = useDataAccess();
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [status, setStatus] = useState<PurchaseDetailStatus>('loading');

  /** 只有首次加载显示骨架；返回页面时的刷新不把已有内容换成骨架，避免闪烁。 */
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
      const result = await getPurchaseDetail(dataAccess, purchaseId);
      if (requestId !== latestRequest.current) {
        return;
      }
      if (result === null) {
        // 「查不到」和「读失败」是两回事：前者不该出现重试按钮。
        setDetail(null);
        hasLoaded.current = true;
        setStatus('notFound');
        return;
      }
      setDetail(result);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
        console.error('[purchases] 读取套餐详情失败', error);
      }
      setStatus('error');
    }
  }, [dataAccess, purchaseId]);

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

  return { status, detail, reload };
}
