import { useCallback, useEffect, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import type { BackupDocument } from '../backup-document';
import { BACKUP_FAILURE_MESSAGES } from '../services/backup-error';
import { openBackupFile } from '../services/open-backup-file';
import { restoreBackup } from '../services/restore-backup';
import type { BackupSummary } from '../services/summarize-backup-document';

/**
 * 恢复成功后的说法。
 *
 * 只说发生了什么，不说「一切正常」「数据已完好」这类我们无从保证的话。
 * 覆盖已经完成且不可撤销，此刻再加感叹号没有任何意义（任务书第九节）。
 */
export const BACKUP_RESTORED_MESSAGE = '数据已从备份恢复';
export const BACKUP_RESTORED_DETAIL = '当前 App 中的数据已经替换为这份备份中的内容。';

export type BackupRestoreStatus =
  /** 还没选文件，或上一次的结果已被清掉。 */
  | 'idle'
  /** 正在选文件、读取与校验。 */
  | 'opening'
  /** 文件已读懂，摘要已经摆在用户面前，等他决定是否覆盖。数据库仍然原样。 */
  | 'ready'
  /** 覆盖事务进行中。此时没有取消入口——事务要么整体成功，要么整体回滚。 */
  | 'restoring'
  | 'restored'
  | 'error';

export type BackupRestoreController = {
  readonly status: BackupRestoreStatus;
  /** 待确认的备份摘要；其它状态下为 null。 */
  readonly summary: BackupSummary | null;
  /** 失败时的中文说明；其它状态下为 null。 */
  readonly errorMessage: string | null;
  /** 选择一个备份文件并读出摘要。不写任何数据。 */
  readonly openFile: () => void;
  /**
   * 执行覆盖。**只应在用户于二次确认框里按下「确认恢复」之后调用。**
   * 返回值让调用方知道要不要跳转，省掉一轮由 effect 驱动的状态推断。
   */
  readonly restore: () => Promise<'restored' | 'unchanged'>;
  /** 放弃这份备份，回到没有选过文件的状态。 */
  readonly clear: () => void;
};

/**
 * 「从备份恢复」的状态机。
 *
 * 两步是刻意分开的：`openFile` 读懂文件并给出摘要，`restore` 才真正写库。
 * 中间那一步——用户盯着摘要确认「是不是这一份」——是整个功能里唯一能挡住
 * 「选错备份」的地方，而覆盖在 App 内没有撤销（任务书第七节）。
 *
 * 并发由服务层的模块级闸门负责，不在这里用 state 兜：`setState` 是异步的，
 * 同一帧里连点两下「确认恢复」，第二下读到的还是旧 `status`。闸门放在服务层
 * 还顺带让导出与恢复互斥。
 *
 * 失败后 `summary` 仍然留着：数据库没有被改动，用户可以直接再点一次，
 * 不必从选文件重来一遍。
 */
export function useBackupRestore(): BackupRestoreController {
  const dataAccess = useDataAccess();
  const [status, setStatus] = useState<BackupRestoreStatus>('idle');
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** 已经读懂、等待确认的那份文档。不放进 state：界面不渲染它，改它也不该触发重绘。 */
  const document = useRef<BackupDocument | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clear = useCallback(() => {
    document.current = null;
    setSummary(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const openFile = useCallback(() => {
    setStatus('opening');
    setErrorMessage(null);

    void (async () => {
      const result = await openBackupFile();
      if (!mounted.current) {
        return;
      }
      switch (result.status) {
        case 'opened':
          document.current = result.document;
          setSummary(result.summary);
          setStatus('ready');
          return;
        case 'canceled':
          // 用户自己关掉了选择器。既不是错误也不是成功，安静回到原状
          //（任务书第 3.3 节）。
          document.current = null;
          setSummary(null);
          setStatus('idle');
          return;
        case 'busy':
          // 另一个备份任务在跑。这只可能来自连点，不值得为它弹一句话。
          setStatus(summaryRefHasDocument(document) ? 'ready' : 'idle');
          return;
        default:
          document.current = null;
          setSummary(null);
          setErrorMessage(BACKUP_FAILURE_MESSAGES[result.stage]);
          setStatus('error');
      }
    })();
  }, []);

  const restore = useCallback(async (): Promise<'restored' | 'unchanged'> => {
    const pending = document.current;
    if (pending === null) {
      return 'unchanged';
    }

    setStatus('restoring');
    setErrorMessage(null);

    const result = await restoreBackup(dataAccess, pending);
    if (!mounted.current) {
      return result.status === 'restored' ? 'restored' : 'unchanged';
    }

    if (result.status === 'restored') {
      // 覆盖已经完成，这份文件的使命结束了。留着摘要只会让人以为还能再点一次。
      document.current = null;
      setSummary(null);
      setStatus('restored');
      return 'restored';
    }
    if (result.status === 'busy') {
      setStatus('ready');
      return 'unchanged';
    }
    // 失败时数据库逐行未变，摘要原样留着，用户可以直接重试。
    setErrorMessage(BACKUP_FAILURE_MESSAGES[result.stage]);
    setStatus('error');
    return 'unchanged';
  }, [dataAccess]);

  return { status, summary, errorMessage, openFile, restore, clear };
}

/** 闸门挡回来时用来决定退回哪个状态：手上还有文档就回到待确认，否则回到空。 */
function summaryRefHasDocument(ref: { readonly current: BackupDocument | null }): boolean {
  return ref.current !== null;
}
