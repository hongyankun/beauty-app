import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { createUuid } from '@/utils/uuid';
import { BackupError, toBackupError } from './backup-error';

/** JSON 的 MIME 类型与 iOS 的统一类型标识，让系统分享面板给出正确的目标应用。 */
const BACKUP_MIME_TYPE = 'application/json';
const BACKUP_UTI = 'public.json';

/** 缓存目录下专门放备份的子目录。放在缓存里，系统空间紧张时可以自行回收。 */
const BACKUP_DIRECTORY_NAME = 'backups';

/**
 * 把一段已经校验过的备份 JSON 写成临时文件，交给系统分享面板，然后清理掉。
 *
 * **每次导出都独占一个随机命名的子目录**：
 * `<cache>/backups/<uuid>/ibeauty-backup-2026-09-19-203045.json`。
 * 文件名本身只精确到秒，同一秒里连点两次就会撞名；而上一份文件此刻很可能
 * 正被分享面板读着，覆盖它会让用户存下一个被改写过的文件。多套一层目录，
 * 用户看到的文件名保持干净，两次导出之间又互不干扰（任务书第七节）。
 *
 * 文件只写进 App 的缓存目录，不写源码目录、不写数据库目录，
 * 因此工作区与 Git 里不会出现备份文件。
 *
 * 分享面板关掉之后，整个子目录在 `finally` 里删除。删除失败**不改判导出结果**：
 * 文件已经交到用户手上了，缓存没清干净是 App 自己的事，不该反过来告诉用户
 * 「备份失败」。这种情况只在 `__DEV__` 里记一句。
 *
 * iOS 上 `shareAsync` 在用户取消时同样正常返回，系统不告诉我们用户选了什么。
 * 所以这里不猜，也不谎称「已保存」——最终的说法由界面给出一句中立的确认
 * （任务书第七节）。
 */
export async function shareBackupJson(json: string, fileName: string): Promise<void> {
  // 先问设备支不支持，再动文件系统：不支持的话连临时文件都不必产生。
  let available: boolean;
  try {
    available = await Sharing.isAvailableAsync();
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 无法判断系统分享面板是否可用', error);
    }
    throw new BackupError('unsupported', error);
  }
  if (!available) {
    throw new BackupError('unsupported');
  }

  const directory = new Directory(Paths.cache, BACKUP_DIRECTORY_NAME, createUuid());
  let file: File;
  try {
    directory.create({ intermediates: true });
    file = new File(directory, fileName);
    file.create();
    file.write(json);
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 写入备份文件失败', error);
    }
    cleanUp(directory);
    throw new BackupError('file', error);
  }

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: BACKUP_MIME_TYPE,
      UTI: BACKUP_UTI,
      dialogTitle: '保存数据备份',
    });
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 打开系统分享面板失败', error);
    }
    throw toBackupError('share', error);
  } finally {
    // 成功、失败、用户取消，三条路都要清理。
    cleanUp(directory);
  }
}

function cleanUp(directory: Directory): void {
  try {
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 清理临时备份文件失败', error);
    }
  }
}
