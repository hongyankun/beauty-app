import { File, Paths } from 'expo-file-system';

import type { BackupDocument } from '../backup-document';
import { toBackupError, type BackupFailureStage } from './backup-error';
import { releaseBackupTask, tryAcquireBackupTask } from './backup-task-gate';
import { parseBackupDocument } from './parse-backup-document';
import { pickBackupFile } from './pick-backup-file';
import { summarizeBackupDocument, type BackupSummary } from './summarize-backup-document';

export type OpenBackupFileResult =
  | {
      readonly status: 'opened';
      /** 已经校验过、档案 ID 已归到本机的文档。确认覆盖时原样交给恢复事务。 */
      readonly document: BackupDocument;
      /** 给用户核对「是不是这一份」的摘要。 */
      readonly summary: BackupSummary;
    }
  /** 用户自己关掉了选择器。零改动、不报错。 */
  | { readonly status: 'canceled' }
  /** 已经有一个备份任务在跑。安静忽略，不弹提示。 */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly stage: BackupFailureStage };

/**
 * 选文件 → 读文本 → 校验 → 数摘要。**全程不写数据库，一行都不改。**
 *
 * 这一步走完，用户看到的是一份摘要和一个危险按钮；数据库此刻仍然是原样。
 * 把「读懂文件」和「覆盖数据」拆成两次明确的用户动作，是因为选错备份
 * 是这个流程里最容易犯、后果也最重的错，而覆盖在 App 内无法撤销
 * （任务书第七节）。
 *
 * 闸门在这里**只占住选文件与解析这一段**，摘要出来就释放。理由很实际：
 * 用户可能盯着摘要想上五分钟，甚至切出去对一对自己的记录。那段时间里
 * 把导出也锁住，只会让人以为 App 卡死了。真正必须互斥的是写库那一下，
 * 它自己在 `restoreBackup` 里再取一次闸门。
 */
export async function openBackupFile(): Promise<OpenBackupFileResult> {
  if (!tryAcquireBackupTask('restore')) {
    return { status: 'busy' };
  }

  try {
    const picked = await pickBackupFile();
    if (picked.status === 'canceled') {
      return { status: 'canceled' };
    }

    const text = await readPickedFile(picked.file.uri);
    const document = parseBackupDocument(text);
    return { status: 'opened', document, summary: summarizeBackupDocument(document) };
  } catch (error) {
    // `toBackupError` 的第一个参数只是兜底：上游各步都已经带着自己的 stage 抛出，
    // 能落到 `fileRead` 的只有真正没被分类的意外。
    const failure = toBackupError('fileRead', error);
    if (__DEV__) {
      // 只记阶段。`cause` 里可能夹着系统给的绝对路径，因此这里不打印它
      //（任务书第四、六节）。
      console.error(`[backup] 打开备份文件失败（${failure.stage}）`);
    }
    return { status: 'failed', stage: failure.stage };
  } finally {
    releaseBackupTask('restore');
  }
}

/**
 * 读出文本，并在读完之后删掉选择器留在缓存里的那份副本。
 *
 * `copyToCacheDirectory` 会把用户选中的文件拷进 App 缓存。不删的话，
 * 用户的消费记录会以明文 JSON 的形式一直躺在缓存目录里——它已经被读进内存了，
 * 留着没有任何用途（任务书第四节）。
 *
 * 删除**只针对缓存目录内**的文件：用户直接选中的本机文件可能就在
 * 「文件」App 里，那是用户自己的东西，我们没有任何理由去动它。
 * 删除失败不改判读取结果，只在 `__DEV__` 里记一句。
 */
async function readPickedFile(uri: string): Promise<string> {
  const file = new File(uri);
  try {
    return await file.text();
  } finally {
    cleanUpCachedCopy(file);
  }
}

function cleanUpCachedCopy(file: File): void {
  try {
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) {
      file.delete();
    }
  } catch {
    if (__DEV__) {
      console.error('[backup] 清理选择器留下的缓存副本失败');
    }
  }
}
