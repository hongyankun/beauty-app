import type {
  BeautyEventRow,
  CatalogFavoriteRow,
  InstitutionRow,
  PersonRow,
  ProfileRow,
  PurchaseItemRow,
  PurchaseRow,
  UsageRecordRow,
  UtcTimestamp,
  WishlistItemRow,
} from '@/db';
import type {
  InstitutionRowV3,
  PurchaseItemRowV3,
  PurchaseRowV3,
  RedemptionRecordRowV3,
} from '@/db/legacy-mapping';

/**
 * 备份文件的格式标识。恢复时先认这个字段，再看版本号：
 * 用户从「文件」里随手挑一个 JSON 进来时，第一道判断是「这是不是本 App 的备份」。
 */
export const BACKUP_FORMAT = 'beauty-app-backup';

/**
 * 备份 **JSON 格式** 的版本，与 App 版本号、数据库 schema 版本都不是一回事。
 *
 * 它只在备份文件的字段结构发生不兼容变化时才加一。数据库加了一张表、
 * 备份里多一个数组，是结构变化，要加；App 发版、schema 升级但备份字段
 * 原样保留，不加。把 App 版本号写进这里，恢复端就得去理解「1.4.2 比 1.4.1 多了什么」，
 * 那是恢复端不该承担的知识（任务书第五节）。
 *
 * 2：schema v4 起的结构（人、变美记录、使用记录，`redemptionRecords` 退役），
 * 见 DATA_MODEL_V4 第 11 节。本版本只导出 2，可以恢复 1 与 2。
 */
export const BACKUP_FORMAT_VERSION = 2;

/** 格式 1 的备份：schema v3 导出，恢复前先在内存中转换为格式 2。 */
export const LEGACY_BACKUP_FORMAT_VERSION = 1;

/**
 * 格式 2 的文档对应的数据库 schema 版本。
 *
 * v1 → v2 转换的结果写这个值，而不是 `LATEST_SCHEMA_VERSION`：转换产物的结构
 * 就是 schema v4 的结构，以后 schema 再升级也不会因此变成别的版本
 * （DATA_MODEL_V4 第 11.3 节）。
 */
export const BACKUP_V2_SCHEMA_VERSION = 4;

/**
 * 一份完整备份（格式 2）。
 *
 * 每个数组里装的都是数据库行类型本身（列名原样、`null` 原样、金额整数分原样），
 * 不是为界面裁剪过的视图。这样恢复时是一对一写回，中间没有一层可能悄悄
 * 丢字段的翻译（任务书第五节）。
 *
 * 这里**没有**的东西同样是规定的一部分：没有剩余次数、没有单次均价、
 * 没有格式化好的「¥199.99」、没有百科正文与资料来源、没有行政区与项目目录、
 * 没有界面文案、没有 SQLite 内部表与 PRAGMA、没有文件路径。前几样都能从这些行
 * 重新算出来，后几样根本不是用户数据。
 *
 * 键的顺序就是导出 JSON 的顺序（DATA_MODEL_V4 第 11.2 节）。
 */
export type BackupDocument = {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  /** 导出时刻，UTC ISO 8601。同一个库连续导出两次，只有这类元数据会不同。 */
  readonly exportedAt: UtcTimestamp;
  /** 导出时数据库的 schema 版本，供恢复端判断能否写回。 */
  readonly databaseSchemaVersion: number;
  readonly profile: ProfileRow;
  /** 含已归档的人；恰好一个「自己」。 */
  readonly people: readonly PersonRow[];
  readonly institutions: readonly InstitutionRow[];
  readonly purchases: readonly PurchaseRow[];
  readonly purchaseItems: readonly PurchaseItemRow[];
  readonly beautyEvents: readonly BeautyEventRow[];
  /** 含 `active` 与 `void`：撤销记录是审计的一部分，不是可以丢掉的垃圾。 */
  readonly usageRecords: readonly UsageRecordRow[];
  readonly wishlistItems: readonly WishlistItemRow[];
  readonly catalogFavorites: readonly CatalogFavoriteRow[];
};

/**
 * 格式 1 的备份（schema v3 时代导出）。
 *
 * 只用于读取旧文件：校验通过后立即转换为 `BackupDocument`，下游从不直接使用它。
 * 行类型取自 `legacy-mapping` 的 v3 定义，与 v3 → v4 迁移共用同一份。
 */
export type BackupDocumentV1 = {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly exportedAt: UtcTimestamp;
  readonly databaseSchemaVersion: number;
  readonly profile: ProfileRow;
  readonly institutions: readonly InstitutionRowV3[];
  readonly purchases: readonly PurchaseRowV3[];
  readonly purchaseItems: readonly PurchaseItemRowV3[];
  readonly redemptionRecords: readonly RedemptionRecordRowV3[];
  readonly wishlistItems: readonly WishlistItemRow[];
  readonly catalogFavorites: readonly CatalogFavoriteRow[];
};

/** 组装一份备份所需的全部原始数据。字段与 `BackupDocument` 的数据部分一一对应。 */
export type BackupSnapshot = {
  readonly profile: ProfileRow;
  readonly people: readonly PersonRow[];
  readonly institutions: readonly InstitutionRow[];
  readonly purchases: readonly PurchaseRow[];
  readonly purchaseItems: readonly PurchaseItemRow[];
  readonly beautyEvents: readonly BeautyEventRow[];
  readonly usageRecords: readonly UsageRecordRow[];
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
    people: snapshot.people,
    institutions: snapshot.institutions,
    purchases: snapshot.purchases,
    purchaseItems: snapshot.purchaseItems,
    beautyEvents: snapshot.beautyEvents,
    usageRecords: snapshot.usageRecords,
    wishlistItems: snapshot.wishlistItems,
    catalogFavorites: snapshot.catalogFavorites,
  };
}
