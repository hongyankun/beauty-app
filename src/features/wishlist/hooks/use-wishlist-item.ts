import { useCallback, useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getWishlistItemForEdit } from '../services/get-wishlist-item-for-edit';
import type { WishlistItemSummary } from '../wishlist-view';

/**
 * 读取单条心愿，供编辑页在挂载时取初值。
 *
 * 与列表页不同，这里**只在挂载时读一次**，不挂 `useFocusEffect`：
 * 这是一个表单页，用户随时可能正在输入框里改到一半，任何自动重读都会把
 * 已填内容与「有没有改动」的比较基准冲掉（PRD-ERR-003）。
 * 需要最新数据时由用户按「重试」显式发起。
 */

export type WishlistItemStatus = 'loading' | 'ready' | 'notFound' | 'error';

export type WishlistItemState = {
  readonly status: WishlistItemStatus;
  /** 读取成功的心愿；其余状态下为 null */
  readonly item: WishlistItemSummary | null;
  readonly reload: () => void;
};

export function useWishlistItem(wishlistItemId: string): WishlistItemState {
  const dataAccess = useDataAccess();
  const [item, setItem] = useState<WishlistItemSummary | null>(null);
  const [status, setStatus] = useState<WishlistItemStatus>('loading');
  /** 重试计数。自增一次就让下面的 effect 重跑一次，这是唯一的重读入口。 */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 上一次读取的结果一律丢弃，避免慢的那个请求后到、覆盖掉新的结果。
    let active = true;

    void (async () => {
      try {
        const result = await getWishlistItemForEdit(dataAccess, wishlistItemId);
        if (!active) {
          return;
        }
        if (result === null) {
          // 「查不到」和「读失败」是两回事：前者不该出现重试按钮。
          setItem(null);
          setStatus('notFound');
          return;
        }
        setItem(result);
        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }
        if (__DEV__) {
          // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
          console.error('[wishlist] 读取心愿失败', error);
        }
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess, wishlistItemId, attempt]);

  const reload = useCallback(() => {
    // 首次读取不需要设 'loading'（它就是初值），重试才需要把上一次的
    // 错误状态换回加载中。
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }, []);

  return { status, item, reload };
}
