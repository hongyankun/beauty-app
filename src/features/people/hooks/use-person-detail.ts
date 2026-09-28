import { useCallback, useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { getPerson } from '../services/get-person';
import type { PersonSummary } from '../services/person-view';

/**
 * 读取单个人，供编辑页在挂载时取初值。
 *
 * 只在挂载时读一次，不挂焦点刷新：自动重读会冲掉正在输入的名称与
 * 「有没有改动」的比较基准（PRD-ERR-003）。
 */

export type PersonDetailStatus = 'loading' | 'ready' | 'notFound' | 'error';

export type PersonDetailState = {
  readonly status: PersonDetailStatus;
  readonly detail: PersonSummary | null;
  readonly reload: () => void;
};

export function usePersonDetail(personId: string): PersonDetailState {
  const dataAccess = useDataAccess();
  const [detail, setDetail] = useState<PersonSummary | null>(null);
  const [status, setStatus] = useState<PersonDetailStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await getPerson(dataAccess, personId);
        if (!active) {
          return;
        }
        if (result === null) {
          setDetail(null);
          setStatus('notFound');
          return;
        }
        setDetail(result);
        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }
        if (__DEV__) {
          console.error('[people] 读取使用人失败', error);
        }
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [dataAccess, personId, attempt]);

  const reload = useCallback(() => {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }, []);

  return { status, detail, reload };
}
