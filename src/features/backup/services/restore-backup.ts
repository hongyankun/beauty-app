import { DEFAULT_PROFILE_ID, LATEST_SCHEMA_VERSION, type DataAccess, type RepositoryBundle } from '@/db';
import type { BackupDocument } from '../backup-document';
import { BackupError, toBackupError, type BackupFailureStage } from './backup-error';
import { releaseBackupTask, tryAcquireBackupTask } from './backup-task-gate';

export type RestoreBackupResult =
  | { readonly status: 'restored' }
  /** 已经有备份任务在跑（含用户连点的第二下）。安静忽略。 */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly stage: BackupFailureStage };

/**
 * 用一份已经校验过的备份**整体覆盖**当前档案。
 *
 * 只有一条路径能到这里：用户看过摘要、在二次确认框里按下了「确认恢复」。
 * 读文件、解析与全部结构校验都已经在事务之外做完了（见 `openBackupFile`），
 * 事务里只剩写。把校验留到事务里做，等于让一个持有独占锁的事务去做一堆
 * 与数据库无关的判断，锁的时间会长得毫无必要。
 *
 * **覆盖，不是合并**（任务书第 3.1 节）：库里有、备份里没有的数据会被删掉。
 * 这正是用户按那个按钮时期待的事——「让 App 回到导出那一刻的样子」。
 * 合并会产生一个既不是现在、也不是备份时刻的第三种状态，谁也说不清它是什么。
 *
 * 一个事务，全成或全不成。中途任何一步抛出，删除与已写入的部分一起回滚，
 * 数据库逐行回到调用前（任务书第九节）。所以失败路径**不需要**任何补偿逻辑：
 * 没有「删到一半」的库需要抢救。
 */
export async function restoreBackup(
  dataAccess: DataAccess,
  document: BackupDocument,
  profileId: string = DEFAULT_PROFILE_ID,
): Promise<RestoreBackupResult> {
  // 同步取闸门：`async` 函数体在第一个 await 之前是同步执行的，因此同一帧里
  // 连点两下，第二下在这里就被挡回去了，不会有第二个事务（任务书第十节）。
  if (!tryAcquireBackupTask('restore')) {
    return { status: 'busy' };
  }

  try {
    await dataAccess.transaction(async (repositories) => {
      await assertSchemaSupported(repositories, document);
      await writeDocument(repositories, document, profileId);
      await verifyRestored(repositories, document, profileId);
    });
    return { status: 'restored' };
  } catch (error) {
    const failure = toBackupError('restore', error);
    if (__DEV__) {
      console.error(`[backup] 恢复失败（${failure.stage}），已整体回滚`);
    }
    return { status: 'failed', stage: failure.stage };
  } finally {
    releaseBackupTask('restore');
  }
}

/**
 * 在事务里再确认一次版本。
 *
 * 外面已经校验过 `databaseSchemaVersion`，这里重来一遍不是多余：那次比较的是
 * 常量 `LATEST_SCHEMA_VERSION`，这次读的是**库里真实的** `PRAGMA user_version`。
 * 两者理论上总是相等（`DatabaseProvider` 要等迁移跑完才渲染子树），
 * 真不相等就说明迁移出了问题，此刻绝不能往下写。
 *
 * 只**读** `user_version`，从不因为文件里写着什么而去改它：备份不是 migration
 * （任务书第三、五节）。
 */
async function assertSchemaSupported(
  repositories: RepositoryBundle,
  document: BackupDocument,
): Promise<void> {
  const schemaVersion = await repositories.restore.getSchemaVersion();
  if (schemaVersion !== LATEST_SCHEMA_VERSION) {
    throw new BackupError('restore');
  }
  if (document.databaseSchemaVersion > schemaVersion) {
    throw new BackupError('incompatible');
  }
}

/**
 * 先清空当前档案，再按依赖顺序写回。
 *
 * 删除的顺序是子表在前（收藏、心愿、核销、项目、套餐、机构），
 * 写入的顺序正好相反（档案、机构、套餐、项目、核销、心愿、收藏）。
 * 这两个顺序必须手工维护：独占事务跑在新连接上，`PRAGMA foreign_keys`
 * 不继承，且 BEGIN 之后再开是静默无效的。**不是关掉了外键，是它本来就没开**——
 * 所以我们既不会去关它，也不能指望它兜底，只能自己排好顺序，再在写完后自查
 * （见 `verifyRestored`）。
 *
 * 档案行走 UPSERT 而不是删了重插：删档案会级联掉一切，而且删除与插入之间
 * 那一瞬间库里一个可用档案都没有。
 */
async function writeDocument(
  repositories: RepositoryBundle,
  document: BackupDocument,
  profileId: string,
): Promise<void> {
  const { restore } = repositories;
  await restore.deleteProfileData(profileId);
  await restore.upsertProfile(document.profile);
  await restore.insertInstitutions(document.institutions);
  await restore.insertPurchases(document.purchases);
  await restore.insertPurchaseItems(document.purchaseItems);
  await restore.insertRedemptionRecords(document.redemptionRecords);
  await restore.insertWishlistItems(document.wishlistItems);
  await restore.insertCatalogFavorites(document.catalogFavorites);
}

/**
 * 写完之后、提交之前的自检。任何一条不过就抛出，整个事务回滚。
 *
 * 三件事：
 *
 * 1. **行数与备份逐表相等。** 这一条同时盖住两种事故：少写了（某一行被约束
 *    挡下却没被发现）与多留了（删除漏掉了一部分，恢复后混进了旧数据）。
 *    数的是**全表**而不是本档案：单档案 App 里全表就该只有这一个档案的数据，
 *    多出来的行无论属于谁都是问题。
 * 2. **引用完整性。** 外键在这个连接上没生效，所以孤儿项目、孤儿核销、
 *    指向不存在机构的引用全部自己数一遍，六个计数必须都是 0。
 * 3. **档案确实在。** 恢复完却没有可用档案，等于把 App 恢复成了一块砖。
 *
 * 这些是**检查**，不是修复：发现不对就整体回滚，绝不「顺手补一下」。
 * 一个被悄悄修补过的恢复结果，和备份对不上，用户却以为它对。
 */
async function verifyRestored(
  repositories: RepositoryBundle,
  document: BackupDocument,
  profileId: string,
): Promise<void> {
  const counts = await repositories.restore.countAllRows();
  const expected = {
    institutions: document.institutions.length,
    purchases: document.purchases.length,
    purchase_items: document.purchaseItems.length,
    redemption_records: document.redemptionRecords.length,
    wishlist_items: document.wishlistItems.length,
    catalog_favorites: document.catalogFavorites.length,
  } as const;
  for (const [table, count] of Object.entries(expected)) {
    if (counts[table as keyof typeof expected] !== count) {
      throw new BackupError('verify');
    }
  }
  if (counts.profiles < 1) {
    throw new BackupError('verify');
  }

  const orphans = await repositories.restore.countOrphans(profileId);
  if (Object.values(orphans).some((count) => count !== 0)) {
    throw new BackupError('verify');
  }

  const profile = await repositories.backup.findProfile(profileId);
  if (profile === null) {
    throw new BackupError('verify');
  }
}
