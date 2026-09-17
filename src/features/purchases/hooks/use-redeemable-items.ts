import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listRedeemableItems, type RedeemableItem } from '../services/list-redeemable-items';

/**
 * 读取可核销的项目，并在页面每次获得焦点时刷新。
 *
 * 用户可能从这里进入核销表单、保存后再返回，也可能在别处把某个项目用完，
 * 焦点刷新保证回到这一页看到的余次是当下的（任务书第五、七节）。
 */

export type RedeemableItemsStatus = 'loading' | 'ready' | 'error';

export type RedeemableItemsState = {
  readonly status: RedeemableItemsStatus;
  /** 最近一次成功读取的结果；读取失败时保留上一次的数据继续可见 */
  readonly items: readonly RedeemableItem[];
  readonly reload: () => void;
};

export function useRedeemableItems(): RedeemableItemsState {
  const dataAccess = useDataAccess();
  const [items, setItems] = useState<readonly RedeemableItem[]>([]);
  const [status, setStatus] = useState<RedeemableItemsStatus>('loading');

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
      const rows = await listRedeemableItems(dataAccess);
      if (requestId !== latestRequest.current) {
        return;
      }
      setItems(rows);
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        // 仅开发期输出。界面上不展示 SQL、表名与堆栈（PRD 第 17.6 节）。
        console.error('[purchases] 读取可核销项目失败', error);
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

  return { status, items, reload };
}
