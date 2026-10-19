import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listItemGroups, type ItemGroup } from '../services/list-item-groups';
import type { PurchaseScope } from '../services/list-purchases';
import { selectScopedGroups, type ItemGroupsStatus, type ScopedGroups } from './item-groups-view';

/**
 * 读取项目视图的分组，并在页面每次获得焦点或购买范围改变时刷新（BT-0024）。
 *
 * 与套餐列表同一套规则：只有首次加载显示骨架；读取失败保留上一次的数据并标明可能不是最新；
 * 自增请求序号保证旧请求晚返回时不会覆盖新结果；离开页面时作废在途请求，卸载后不再写状态。
 * 结果记下所属的购买范围：切换范围后不再显示旧范围的分组（`selectScopedGroups`，BT-0024A）。
 */

export type ItemGroupsState = {
  readonly status: ItemGroupsStatus;
  readonly groups: readonly ItemGroup[];
  readonly reload: () => void;
};

export function useItemGroups(scope: PurchaseScope): ItemGroupsState {
  const dataAccess = useDataAccess();
  const [loaded, setLoaded] = useState<ScopedGroups | null>(null);
  const [status, setStatus] = useState<ItemGroupsStatus>('loading');
  const hasLoaded = useRef(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    if (!hasLoaded.current) {
      setStatus('loading');
    }
    try {
      const result = await listItemGroups(dataAccess, scope);
      if (requestId !== latestRequest.current) {
        return;
      }
      setLoaded({ scope, groups: result });
      hasLoaded.current = true;
      setStatus('ready');
    } catch (error) {
      if (requestId !== latestRequest.current) {
        return;
      }
      if (__DEV__) {
        console.error('[purchases] 读取项目视图失败', error instanceof Error ? error.name : typeof error);
      }
      setStatus('error');
    }
  }, [dataAccess, scope]);

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

  return { ...selectScopedGroups(loaded, scope, status), reload };
}
