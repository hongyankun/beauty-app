import type { DataAccess } from '@/db';
import { buildBackupFileName } from './backup-file-name';
import { toBackupError, type BackupFailureStage } from './backup-error';
import { readBackupDocument } from './read-backup-document';
import { serializeBackupDocument } from './serialize-backup-document';
import { shareBackupJson } from './share-backup-file';

export type ExportBackupResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly stage: BackupFailureStage };

/**
 * 一次完整的导出：读取 → 组装 → 自检 → 序列化 → 再自检 → 写临时文件 → 调起分享面板 → 清理。
 *
 * 顺序是有讲究的：**两道自检都在写文件之前**。校验没过就直接失败，
 * 绝不会让用户在分享面板里存下一份缺东西的备份（任务书第五节）。
 *
 * 全程只有读：不写数据库，不改任何一行业务数据，也不访问网络。
 *
 * 失败以返回值表达而不是抛异常。这里没有第二种调用方，抛出去只会让
 * 每个调用点都得重写一遍同样的 try/catch；`stage` 已经足够界面选出该说哪句话。
 */
export async function exportBackup(
  dataAccess: DataAccess,
  now: Date = new Date(),
): Promise<ExportBackupResult> {
  try {
    // 同一个时刻既写进 `exportedAt`，也写进文件名，两者不会差出一秒。
    const document = await readBackupDocument(dataAccess, undefined, now);
    const json = serializeBackupDocument(document);
    await shareBackupJson(json, buildBackupFileName(now));
    return { ok: true };
  } catch (error) {
    const failure = toBackupError('build', error);
    if (__DEV__) {
      console.error(`[backup] 导出失败（${failure.stage}）`, failure.cause ?? failure);
    }
    return { ok: false, stage: failure.stage };
  }
}
