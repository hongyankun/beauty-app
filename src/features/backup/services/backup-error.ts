/**
 * 备份（导出与恢复）失败的分类。
 *
 * 分这几档不是为了记日志好看，而是因为用户需要知道**下一步该做什么**：
 * 设备不支持分享面板时再点几次也没用，读数据失败则值得重试；
 * 「文件不是备份」要换一个文件，「备份来自更新版本」换文件也没用。
 * 每一档对应一句固定中文说明，原始错误只留在 `cause` 里，不进界面。
 *
 * 恢复侧的阶段按任务书要求至少区分 pick / read / parse / validate /
 * incompatible / restore / verify 七步。这里的 `read` 已经被导出侧的
 * 「从数据库读取」占用，因此文件读取单列为 `fileRead`，两者含义不同、
 * 用户看到的话也不同，不能合并。
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
  | 'share'
  /** 调起系统文件选择器失败。用户主动取消**不是**失败，不走这里。 */
  | 'pick'
  /** 读取用户选中的那个文件失败。 */
  | 'fileRead'
  /** 文件超出体积上限，在解析之前就被挡下。 */
  | 'oversize'
  /** 内容不是合法 JSON，或根本不是本 App 的备份。 */
  | 'parse'
  /** 是本 App 的备份，但内容不完整或内部引用对不上。 */
  | 'validate'
  /** 备份来自更新的格式版本或更新的数据库版本，本版本不去猜。 */
  | 'incompatible'
  /** 写入事务失败，已整体回滚。 */
  | 'restore'
  /** 写入后的事务内自检没通过，已整体回滚。 */
  | 'verify';

/** 用户可见的失败说明。只说发生了什么、能不能重试，不含 SQL、表名、路径与堆栈。 */
export const BACKUP_FAILURE_MESSAGES: Readonly<Record<BackupFailureStage, string>> = {
  read: '没能读取需要备份的数据，请稍后再试。',
  build: '没能生成备份文件，请稍后再试。',
  unsupported: '当前设备无法打开系统分享面板。',
  file: '没能生成备份文件，请稍后再试。',
  share: '没能打开系统分享面板，请稍后再试。',
  pick: '没能打开文件选择器，请稍后再试。',
  fileRead: '没能读取这个文件，请重新选择。',
  oversize: '备份文件过大，无法恢复。',
  parse: '这个文件不是有效的备份文件。',
  validate: '备份内容不完整或存在关联错误。',
  incompatible: '这个备份来自更新版本，当前 App 暂时无法恢复。',
  // 恢复失败与自检失败对用户是同一件事：什么都没变，可以再试一次。
  // 两个阶段仍然分开记录，因为它们对开发者意味着完全不同的问题。
  restore: '恢复没有完成，你的数据没有被改动。',
  verify: '恢复没有完成，你的数据没有被改动。',
};

/** 备份过程中的失败。`stage` 决定用户看到哪句话，`cause` 只用于 `__DEV__` 日志。 */
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
