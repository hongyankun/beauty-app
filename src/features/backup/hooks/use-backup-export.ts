import { useCallback, useEffect, useRef, useState } from 'react';

import { useDataAccess } from '@/hooks/use-data-access';
import { BACKUP_FAILURE_MESSAGES } from '../services/backup-error';
import { releaseBackupTask, tryAcquireBackupTask } from '../services/backup-task-gate';
import { exportBackup } from '../services/export-backup';

/**
 * 导出成功后的说法。
 *
 * 刻意只说到「文件已生成、分享面板已经打开过」为止。系统不会告诉我们用户在
 * 分享面板里点了「存储到文件」还是直接划走，所以断言「已保存」就是在撒谎
 * （任务书第七节）。
 */
export const BACKUP_SHARED_MESSAGE =
  '备份文件已生成。请确认你已经在系统分享面板中选择了保存位置。';

export type BackupExportStatus =
  /** 还没导出过，或上一次的结果已被新的一次覆盖。 */
  | 'idle'
  /** 正在读取、生成或等待分享面板。 */
  | 'exporting'
  /** 分享面板已经出现过并关闭。 */
  | 'shared'
  | 'error';

export type BackupExportController = {
  readonly status: BackupExportStatus;
  /** 成功后的中立说明；其它状态下为 null。 */
  readonly sharedMessage: string | null;
  /** 失败时的中文说明；其它状态下为 null。 */
  readonly errorMessage: string | null;
  readonly start: () => void;
};

/**
 * 「导出备份」按钮背后的状态机。
 *
 * 并发闸门用的是模块级的 `backup-task-gate` 而不是 `status`：`setState` 是异步的，
 * 用户在同一帧里连点两下时第二下看到的还是旧 `status`，只有同步赋值能当场把它
 * 挡回去（任务书第十节）。这里挡住的不只是重复的 UI 反馈，更是第二次读库与
 * 第二个临时文件。
 *
 * 用共享闸门而不是本 hook 自己的 ref，是为了让导出与恢复互相看得见：
 * 恢复会先清空当前档案再写回，此时并发的导出会读到一个删了一半的库，
 * 而那份备份还能通过自检——用户拿到的是一份「合法但缺一半」的文件。
 *
 * 分享面板返回后闸门就打开了，用户可以立刻再导一次——那是完全正常的操作，
 * 比如第一次分享到 AirDrop、第二次再存进「文件」。
 */
export function useBackupExport(): BackupExportController {
  const dataAccess = useDataAccess();
  const [status, setStatus] = useState<BackupExportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 页面已经卸载时不再写状态。导出中途用户可以按返回离开这一页，
   * 分享面板关掉之后这个回调仍然会跑（任务书第十节）。
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(() => {
    if (!tryAcquireBackupTask('export')) {
      return;
    }
    setStatus('exporting');
    setErrorMessage(null);

    void (async () => {
      try {
        const result = await exportBackup(dataAccess);
        if (!mounted.current) {
          return;
        }
        if (result.ok) {
          setStatus('shared');
          return;
        }
        setErrorMessage(BACKUP_FAILURE_MESSAGES[result.stage]);
        setStatus('error');
      } finally {
        // 放 finally 而不是成功分支里：漏掉一条失败路径，整个 App 的备份功能
        // 就会一直卡在「什么都点不动」。
        releaseBackupTask('export');
      }
    })();
  }, [dataAccess]);

  return {
    status,
    sharedMessage: status === 'shared' ? BACKUP_SHARED_MESSAGE : null,
    errorMessage: status === 'error' ? errorMessage : null,
    start,
  };
}
