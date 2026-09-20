import type {
  CatalogFavoriteRow,
  InstitutionRow,
  ProfileRow,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  UtcTimestamp,
  WishlistItemRow,
} from '@/db';

/**
 * 备份文件的格式标识。恢复时先认这个字段，再看版本号：
 * 用户从「文件」里随手挑一个 JSON 进来时，第一道判断是「这是不是本 App 的备份」。
 */
export const BACKUP_FORMAT = 'beauty-app-backup';

/**
 * 备份 **JSON 格式** 的版本，与 App 版本号、数据库 schema 版本都不是一回事。
 *
 * 它只在备份文件的字段结构发生不兼容变化时才加一。数据库加了一张表、
 * 备份里多一个数组，是结构变化，要加；App 发版、schema 从 3 迁到 4 但备份字段
 * 原样保留，不加。把 App 版本号写进这里，恢复端就得去理解「1.4.2 比 1.4.1 多了什么」，
 * 那是恢复端不该承担的知识（任务书第五节）。
 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * 一份完整备份。
 *
 * 每个数组里装的都是数据库行类型本身（列名原样、`null` 原样、金额整数分原样），
 * 不是为界面裁剪过的视图。这样恢复时是一对一写回，中间没有一层可能悄悄
 * 丢字段的翻译（任务书第五节）。
 *
 * 这里**没有**的东西同样是规定的一部分：没有剩余次数、没有累计金额、
 * 没有格式化好的「¥199.99」、没有百科正文与资料来源、没有界面文案、
 * 没有 SQLite 内部表与 PRAGMA、没有文件路径。前几样都能从这些行重新算出来，
 * 后几样根本不是用户数据。
 */
export type BackupDocument = {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  /** 导出时刻，UTC ISO 8601。同一个库连续导出两次，只有这类元数据会不同。 */
  readonly exportedAt: UtcTimestamp;
  /** 导出时数据库的 schema 版本，供恢复端判断是否需要先迁移。 */
  readonly databaseSchemaVersion: number;
  readonly profile: ProfileRow;
  readonly institutions: readonly InstitutionRow[];
  readonly purchases: readonly PurchaseRow[];
  readonly purchaseItems: readonly PurchaseItemRow[];
  /** 含 `active` 与 `void`：撤销记录是审计的一部分，不是可以丢掉的垃圾。 */
  readonly redemptionRecords: readonly RedemptionRecordRow[];
  readonly wishlistItems: readonly WishlistItemRow[];
  readonly catalogFavorites: readonly CatalogFavoriteRow[];
};

/** 组装一份备份所需的全部原始数据。字段与 `BackupDocument` 的数据部分一一对应。 */
export type BackupSnapshot = {
  readonly profile: ProfileRow;
  readonly institutions: readonly InstitutionRow[];
  readonly purchases: readonly PurchaseRow[];
  readonly purchaseItems: readonly PurchaseItemRow[];
  readonly redemptionRecords: readonly RedemptionRecordRow[];
  readonly wishlistItems: readonly WishlistItemRow[];
  readonly catalogFavorites: readonly CatalogFavoriteRow[];
};

/**
 * 把一次读取到的快照包装成备份文档。纯函数：不碰数据库，不碰时钟，不碰文件系统。
 *
 * `exportedAt` 与 `databaseSchemaVersion` 由调用方传进来，正是为了让它保持纯粹——
 * 验证时可以喂一个固定时间，断言「两次导出只有 exportedAt 不同」才有意义。
 */
export function buildBackupDocument(
  snapshot: BackupSnapshot,
  meta: { readonly exportedAt: UtcTimestamp; readonly databaseSchemaVersion: number },
): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: meta.exportedAt,
    databaseSchemaVersion: meta.databaseSchemaVersion,
    profile: snapshot.profile,
    institutions: snapshot.institutions,
    purchases: snapshot.purchases,
    purchaseItems: snapshot.purchaseItems,
    redemptionRecords: snapshot.redemptionRecords,
    wishlistItems: snapshot.wishlistItems,
    catalogFavorites: snapshot.catalogFavorites,
  };
}
