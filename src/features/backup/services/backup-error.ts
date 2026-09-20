/**
 * 导出失败的分类。
 *
 * 分这几档不是为了记日志好看，而是因为用户需要知道**下一步该做什么**：
 * 设备不支持分享面板时再点几次也没用，读数据失败则值得重试。
 * 每一档对应第九节规定的一句中文说明，原始错误只留在 `cause` 里，
 * 不进界面（任务书第九节）。
 */
export type BackupFailureStage =
  /** 从数据库读取需要备份的数据时失败。 */
  | 'read'
  /** 组装或自检没通过——备份内容不完整，此时绝不能调起分享面板。 */
  | 'build'
  /** 这台设备没有系统分享面板（例如部分模拟器与 Web）。 */
  | 'unsupported'
  /** 写入临时文件失败。 */
  | 'file'
  /** 调起系统分享面板失败。 */
  | 'share';

/** 用户可见的失败说明。只说发生了什么、能不能重试，不含 SQL、表名、路径与堆栈。 */
export const BACKUP_FAILURE_MESSAGES: Readonly<Record<BackupFailureStage, string>> = {
  read: '没能读取需要备份的数据，请稍后再试。',
  build: '没能生成备份文件，请稍后再试。',
  unsupported: '当前设备无法打开系统分享面板。',
  file: '没能生成备份文件，请稍后再试。',
  share: '没能打开系统分享面板，请稍后再试。',
};

/** 导出过程中的失败。`stage` 决定用户看到哪句话，`cause` 只用于 `__DEV__` 日志。 */
export class BackupError extends Error {
  readonly stage: BackupFailureStage;

  constructor(stage: BackupFailureStage, cause?: unknown) {
    super(`backup failed at stage: ${stage}`, cause === undefined ? undefined : { cause });
    this.name = 'BackupError';
    this.stage = stage;
  }
}

/** 把任意异常收敛成 `BackupError`，避免某一层漏包导致上层拿到裸错误。 */
export function toBackupError(stage: BackupFailureStage, error: unknown): BackupError {
  return error instanceof BackupError ? error : new BackupError(stage, error);
}
