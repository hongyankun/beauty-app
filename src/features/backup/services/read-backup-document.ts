import { DEFAULT_PROFILE_ID, LATEST_SCHEMA_VERSION, type DataAccess } from '@/db';
import { buildBackupDocument, type BackupDocument, type BackupSnapshot } from '../backup-document';
import { BackupError, toBackupError } from './backup-error';
import { validateBackupDocument } from './validate-backup-document';

/**
 * 读出一份完整备份。
 *
 * 七次查询全部包在**同一个事务**里（`runInTransaction` 在原生上用的是
 * 独占事务）。这不是谨慎过头：备份是七条独立查询拼起来的，用户完全可能在
 * 第三条和第四条之间按下「撤销核销」或删掉一个套餐，那样导出的备份里会出现
 * 「核销引用了一个已经不存在的项目」这种恢复时必炸的组合。一个一致性快照
 * 把这种可能性直接排除（任务书第六节）。
 *
 * 事务里只有读，没有任何写：导出不修改数据库。
 *
 * `exportedAt` 与 `databaseSchemaVersion` 在**事务之外**确定。前者是元数据，
 * 与数据内容无关；后者用 `LATEST_SCHEMA_VERSION`——`DatabaseProvider` 要等迁移
 * 全部跑完才渲染子树，页面能调到这里就说明库已经在最新版本上，
 * 为此再去读一次 `PRAGMA user_version` 只会把 PRAGMA 带进本该只谈业务数据的路径。
 */
export async function readBackupDocument(
  dataAccess: DataAccess,
  profileId: string = DEFAULT_PROFILE_ID,
  now: Date = new Date(),
): Promise<BackupDocument> {
  const snapshot = await readSnapshot(dataAccess, profileId);

  const document = buildBackupDocument(snapshot, {
    exportedAt: now.toISOString(),
    databaseSchemaVersion: LATEST_SCHEMA_VERSION,
  });

  // 自检不过就到此为止，绝不往下走到写文件与分享：一份缺东西的备份比没有备份
  // 更危险，用户会以为自己已经有了（任务书第五、十节）。
  const validation = validateBackupDocument(document);
  if (!validation.ok) {
    if (__DEV__) {
      console.error('[backup] 备份自检未通过', validation.issues);
    }
    throw new BackupError('build');
  }

  return document;
}

async function readSnapshot(dataAccess: DataAccess, profileId: string): Promise<BackupSnapshot> {
  try {
    return await dataAccess.transaction(async (repositories) => {
      const profile = await repositories.backup.findProfile(profileId);
      if (profile === null) {
        throw new BackupError('read');
      }

      // 顺序读而不是 Promise.all：它们共用同一个事务连接，并发发出去也要排队，
      // 顺序写法还少一层「哪条语句失败了」的猜测。
      const institutions = await repositories.backup.listInstitutions(profileId);
      const purchases = await repositories.backup.listPurchases(profileId);
      const purchaseItems = await repositories.backup.listPurchaseItems(profileId);
      const redemptionRecords = await repositories.backup.listRedemptionRecords(profileId);
      const wishlistItems = await repositories.backup.listWishlistItems(profileId);
      const catalogFavorites = await repositories.backup.listCatalogFavorites(profileId);

      return {
        profile,
        institutions,
        purchases,
        purchaseItems,
        redemptionRecords,
        wishlistItems,
        catalogFavorites,
      };
    });
  } catch (error) {
    if (__DEV__) {
      console.error('[backup] 读取备份数据失败', error);
    }
    throw toBackupError('read', error);
  }
}
