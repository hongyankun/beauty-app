import type { BackupDocument } from '../backup-document';
import { BackupError } from './backup-error';
import { validateBackupDocument } from './validate-backup-document';

/** 缩进两个空格：备份是用户拿得到的文件，人应该能直接打开看懂。 */
const JSON_INDENT = 2;

/**
 * 把备份序列化成要写进文件的那段文本，并当场验证它确实能被读回来。
 *
 * 「序列化完再解析回来校验一遍」不是形式主义。`JSON.stringify` 会**静默丢掉**
 * 取值为 `undefined` 的键，也会把 `NaN` 与 `Infinity` 变成 `null`——两者都不会报错，
 * 只会让文件里安静地少一个字段。往返一趟再校验，是唯一能在写盘之前发现这件事的办法
 * （任务书第五、十节）。
 *
 * 中文不需要任何转义处理：`JSON.stringify` 输出的就是原字符，文件按 UTF-8 写入，
 * 读回来还是同样的字符串。
 */
export function serializeBackupDocument(document: BackupDocument): string {
  let json: string;
  try {
    json = JSON.stringify(document, null, JSON_INDENT);
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 序列化备份失败', error);
    }
    throw new BackupError('build', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 备份无法被重新解析', error);
    }
    throw new BackupError('build', error);
  }

  const validation = validateBackupDocument(parsed);
  if (!validation.ok) {
    if (__DEV__) {
      // 只记问题清单，不记备份内容本身：那是用户的全部消费记录（任务书第九节）。
      console.error('[backup] 序列化后的备份自检未通过', validation.issues);
    }
    throw new BackupError('build');
  }

  return json;
}
