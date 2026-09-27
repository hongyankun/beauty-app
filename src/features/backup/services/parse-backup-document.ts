import type { BackupDocument, BackupDocumentV1 } from '../backup-document';
import { remapToLocalProfile, remapV1ToLocalProfile } from '../backup-profile-mapping';
import { BackupError, type BackupFailureStage } from './backup-error';
import { exceedsBackupSizeLimit, utf8ByteLength } from './backup-file-limits';
import { convertBackupV1ToV2 } from './convert-backup-v1-to-v2';
import {
  validateBackupDocument,
  validateBackupDocumentV2,
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
 *    格式 1 的备份在改写之后、于内存中转换为格式 2，再完整校验一遍格式 2 的规则；
 *    先改写再转换，「自己」的标识才会落在本机档案上（DATA_MODEL_V4 第 11.3 节）。
 *    原文本不被修改，下游只见到格式 2。
 *
 * 全程不碰数据库，不碰文件系统，不碰网络：一个纯函数，喂什么就判什么，
 * 因此自动化验证里可以直接构造各种坏文件。
 */
export type ParsedBackup = {
  /** 格式 2 的文档，档案 ID 已归到本机。格式 1 的文件在这里已经转换完成。 */
  readonly document: BackupDocument;
  /** 文件自身的格式版本（1 或 2），供摘要如实展示；转换不改变它。 */
  readonly sourceFormatVersion: 1 | 2;
};

export function parseBackupDocument(text: string): ParsedBackup {
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

  if (validation.formatVersion === 2) {
    return { document: remapToLocalProfile(value as BackupDocument), sourceFormatVersion: 2 };
  }
  return {
    document: convertLegacyDocument(remapV1ToLocalProfile(value as BackupDocumentV1)),
    sourceFormatVersion: 1,
  };
}

/** 格式 1 → 格式 2，并对转换结果做一次完整的格式 2 校验。任何一步不过都算内容错误。 */
function convertLegacyDocument(legacy: BackupDocumentV1): BackupDocument {
  let converted: BackupDocument;
  try {
    converted = convertBackupV1ToV2(legacy);
  } catch {
    // 转换错误的说明是固定文案，不含行内容；这里仍然不打印，免得以后有人往里加字段值。
    if (__DEV__) {
      console.error('[backup] 格式 1 备份转换失败');
    }
    throw new BackupError('validate');
  }

  const validation = validateBackupDocumentV2(converted);
  if (!validation.ok) {
    if (__DEV__) {
      console.error(`[backup] 格式 1 备份转换后校验未通过（${validation.kind}）`, validation.issues);
    }
    throw new BackupError('validate');
  }
  return converted;
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
