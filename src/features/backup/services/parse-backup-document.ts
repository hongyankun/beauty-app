import type { BackupDocument } from '../backup-document';
import { remapToLocalProfile } from '../backup-profile-mapping';
import { BackupError, type BackupFailureStage } from './backup-error';
import { exceedsBackupSizeLimit, utf8ByteLength } from './backup-file-limits';
import {
  validateBackupDocument,
  type BackupValidationFailureKind,
} from './validate-backup-document';

/**
 * 把用户选中的那段文本变成一份可以信任的备份文档。
 *
 * 这是整个恢复流程里**唯一**把不可信输入变成 `BackupDocument` 的地方。
 * 越过这一关之后，下游可以按类型使用它；在这之前，它只是一段文本。
 *
 * 四步，顺序不能换：
 *
 * 1. **量体积**——在 `JSON.parse` 之前。选择器给的 `size` 不一定准也不一定有，
 *    所以这里按真实内容再量一次（任务书第四节）。
 * 2. **解析**——只用内置 `JSON.parse`，不引第三方解析库。`JSON.parse` 不执行
 *    任何东西，文件里写着什么 SQL、什么函数，出来都只是字符串（任务书第十五节）。
 * 3. **校验**——复用导出侧那一个校验器，不另写一套会各自漂移的规则。
 *    它给出「根本不是备份 / 是备份但内容坏了 / 来自更新版本」三种结论，
 *    对应三句不同的中文。
 * 4. **改写档案 ID**——集中在一个纯函数里完成，见 `backup-profile-mapping`。
 *
 * 全程不碰数据库，不碰文件系统，不碰网络：一个纯函数，喂什么就判什么，
 * 因此自动化验证里可以直接构造各种坏文件。
 */
export function parseBackupDocument(text: string): BackupDocument {
  if (exceedsBackupSizeLimit(utf8ByteLength(text))) {
    throw new BackupError('oversize');
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // 这里连 `error.message` 都不看：JSON 解析错误会带上出错位置附近的原文，
    // 那就是用户的备份内容（任务书第六节禁止把备份内容写进日志）。
    if (__DEV__) {
      console.error('[backup] 选中的文件不是合法 JSON');
    }
    throw new BackupError('parse');
  }

  const validation = validateBackupDocument(value);
  if (!validation.ok) {
    if (__DEV__) {
      // `issues` 只描述「哪个位置的什么规则没过」，不含字段取值，可以安全打印。
      console.error(`[backup] 备份校验未通过（${validation.kind}）`, validation.issues);
    }
    throw new BackupError(VALIDATION_FAILURE_STAGES[validation.kind]);
  }

  return remapToLocalProfile(value as BackupDocument);
}

/**
 * 校验失败的性质 → 用户看到哪句话。
 *
 * `notBackup` 落到 `parse` 而不是 `validate`：对用户来说「这个 JSON 不是本 App
 * 的备份」和「这段文本压根不是 JSON」是同一件事——选错文件了，该去挑另一个。
 * 说成「内容不完整」反而会让人以为这份文件本来是对的、只是坏了，
 * 于是去找恢复它的办法（任务书第九节）。
 */
const VALIDATION_FAILURE_STAGES = {
  notBackup: 'parse',
  invalid: 'validate',
  incompatible: 'incompatible',
} as const satisfies Record<BackupValidationFailureKind, BackupFailureStage>;
