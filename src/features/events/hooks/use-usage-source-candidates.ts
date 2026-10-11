import { useCallback, useEffect, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import {
  listUsageSourceCandidates,
  type UsageSourceCandidate,
} from '../services/list-usage-source-candidates';

/**
 * 「使用已有套餐」来源的候选项目。只在挂载时读一次：表单有了输入后自动重读不该改动它，
 * 页面停留期间余次的变化由保存时的事务内校验兜住。
 */

export type UsageSourceCandidatesState = {
  readonly status: 'loading' | 'ready' | 'error';
  readonly candidates: readonly UsageSourceCandidate[];
  readonly reload: () => void;
};

export function useUsageSourceCandidates(): UsageSourceCandidatesState {
  const dataAccess = useDataAccess();
  const [candidates, setCandidates] = useState<readonly UsageSourceCandidate[]>([]);
  const [status, setStatus] = useState<UsageSourceCandidatesState['status']>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await listUsageSourceCandidates(dataAccess);
        if (!active) {
          return;
        }
        setCandidates(loaded);
        setStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }
        if (__DEV__) {
          console.error('[events] 读取可用套餐失败', error instanceof Error ? error.name : typeof error);
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

  return { status, candidates, reload };
}
