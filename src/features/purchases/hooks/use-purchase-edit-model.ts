import { useCallback, useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getPurchaseForEdit, type PurchaseEditModel } from '../services/get-purchase-for-edit';

/**
 * 读取编辑页的初值。
 *
 * 与详情页不同，这里**只在挂载时读一次**，不挂 `useFocusEffect`：
 * 编辑页一旦有了用户输入，任何自动重读都会把他刚填的内容冲掉。
 * 需要最新数据时由用户主动重试，或者放弃修改退回详情页重新进入。
 */

export type PurchaseEditModelStatus = 'loading' | 'ready' | 'notFound' | 'error';

export type PurchaseEditModelState = {
  readonly status: PurchaseEditModelStatus;
  /** 读取成功的初值；其余状态下为 null */
  readonly model: PurchaseEditModel | null;
  readonly reload: () => void;
};

export function usePurchaseEditModel(purchaseId: string): PurchaseEditModelState {
  const dataAccess = useDataAccess();
  const [model, setModel] = useState<PurchaseEditModel | null>(null);
  const [status, setStatus] = useState<PurchaseEditModelStatus>('loading');
  /** 重试计数。自增一次就让下面的 effect 重跑一次，这是唯一的重读入口。 */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 上一次读取的结果一律丢弃，避免慢的那个请求后到、覆盖掉新的结果。
    let active = true;

    void (async () => {
      try {
        const result = await getPurchaseForEdit(dataAccess, purchaseId);
        if (!active) {
          return;
        }
        if (result === null) {
          // 「查不到」和「读失败」是两回事：前者不该出现重试按钮。
          setModel(null);
          setStatus('notFound');
          return;
        }
        setModel(result);
        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }
        if (__DEV__) {
          // 仅开发期输出。界面上不展示 SQL 与堆栈（PRD 第 17.6 节）。
          console.error('[purchases] 读取套餐编辑初值失败', error);
        }
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess, purchaseId, attempt]);

  const reload = useCallback(() => {
    // 首次读取不需要设 'loading'（它就是初值），重试才需要把上一次的
    // 错误状态换回加载中。
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }, []);

  return { status, model, reload };
}
