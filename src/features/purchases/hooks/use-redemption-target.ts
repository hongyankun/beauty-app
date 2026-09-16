import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getRedemptionTarget, type RedemptionTarget } from '../services/get-redemption-target';

/**
 * 读取核销表单的目标项目。
 *
 * 与列表、详情一样在获得焦点时刷新，但**只在首次加载时进入 loading**：
 * 表单已经填了一半时把状态退回 loading 会把整张表单卸载掉，用户输入就没了。
 * 刷新失败同样保留上一次读到的项目，让用户至少能把内容存下来。
 *
 * 这份数据稍旧也不会导致超额核销——真正的余次校验发生在保存时的事务里
 * （任务书第八、十二节）。
 */

export type RedemptionTargetStatus = 'loading' | 'ready' | 'missing' | 'error';

export type RedemptionTargetState = {
  readonly status: RedemptionTargetStatus;
  /** 最近一次成功读取的项目；读取失败时保留上一次的结果 */
  readonly target: RedemptionTarget | null;
  readonly reload: () => void;
};

export function useRedemptionTarget(purchaseItemId: string): RedemptionTargetState {
  const dataAccess = useDataAccess();
  const [target, setTarget] = useState<RedemptionTarget | null>(null);
  const [status, setStatus] = useState<RedemptionTargetStatus>('loading');

  /** 只有首次加载显示载入中；之后的刷新不把表单换掉。 */
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
      const result = await getRedemptionTarget(dataAccess, purchaseItemId);
      if (requestId !== latestRequest.current) {
        return;
      }
      if (result === null) {
        // 「查不到」和「读失败」是两回事：前者不该出现重试按钮。
        setTarget(null);
        hasLoaded.current = true;
        setStatus('missing');
        return;
      }
      setTarget(result);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
        console.error('[purchases] 读取核销项目失败', error);
      }
      setStatus('error');
    }
  }, [dataAccess, purchaseItemId]);

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

  return { status, target, reload };
}
