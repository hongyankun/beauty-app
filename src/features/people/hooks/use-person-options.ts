import { useCallback, useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { listPersonOptions, type PersonOptionsResult } from '../services/list-person-options';

/**
 * 读取购买人 / 使用人选择器的选项，供套餐表单与核销表单使用。
 *
 * 与机构选项不同，读取失败**会**阻断表单：购买人与使用人是必填项，默认值「自己」
 * 也来自这里，读不到就无法给出一个合法的初值（PRD 第 5B.4 节）。因此暴露状态与重试。
 *
 * 只在挂载时读一次，不挂 `useFocusEffect`：表单一旦有了用户输入，自动重读不该改动它。
 * 页面停留期间有人被归档也没关系，保存时 service 会在事务内重新校验。
 */

export type PersonOptionsStatus = 'loading' | 'ready' | 'error';

export type PersonOptionsState = {
  readonly status: PersonOptionsStatus;
  /** 读取成功的结果；其余状态下为 null */
  readonly result: PersonOptionsResult | null;
  readonly reload: () => void;
};

export function usePersonOptions(): PersonOptionsState {
  const dataAccess = useDataAccess();
  const [result, setResult] = useState<PersonOptionsResult | null>(null);
  const [status, setStatus] = useState<PersonOptionsStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const loaded = await listPersonOptions(dataAccess);
        if (!active) {
          return;
        }
        setResult(loaded);
        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }
        if (__DEV__) {
          console.error('[people] 读取使用人选项失败', error instanceof Error ? error.name : typeof error);
        }
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess, attempt]);

  const reload = useCallback(() => {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }, []);

  return { status, result, reload };
}
