/**
 * 本地数据库层统一出口。
 *
 * 上层（Provider、未来的 repository）只从这里导入；
 * 页面不得直接执行 SQL，也不得绕过 repository 直接使用连接。
 */
export {
  DATABASE_NAME,
  DEFAULT_CURRENCY,
  DEFAULT_PROFILE_DISPLAY_NAME,
  DEFAULT_PROFILE_ID,
  PERSON_STATUSES,
  PURCHASE_ITEM_CATEGORIES,
  PURCHASE_KINDS,
  REDEMPTION_STATUSES,
  SELF_PERSON_DISPLAY_NAME,
  SELF_PERSON_ID,
  USAGE_SOURCE_KINDS,
  USAGE_STATUSES,
} from './constants';

export { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

export { DatabaseInitializationError, initializeDatabase } from './initialize-database';

export { createDataAccess } from './repositories';

export type {
  BackupRepository,
  CatalogFavoriteListRow,
  CatalogFavoriteRepository,
  DashboardRepository,
  DashboardTotalsRow,
  DataAccess,
  DatedPurchaseItemFactRow,
  InstitutionConflictRow,
  InstitutionOption,
  InstitutionRepository,
  InstitutionUpdate,
  InstitutionUsageRow,
  PeopleRepository,
  PurchaseDeletionImpactRow,
  PurchaseItemContextRow,
  PurchaseItemDetailRow,
  PurchaseItemEditRow,
  PurchaseItemUpdate,
  PurchaseRepository,
  PurchaseSummaryRow,
  PurchaseUpdate,
  RecentRedemptionRow,
  RedeemableItemRow,
  RedemptionContextRow,
  RedemptionHistoryEntryRow,
  RedemptionHistoryRow,
  RedemptionRepository,
  RedemptionStatusFilter,
  RepositoryBundle,
  RestoreOrphanCountsRow,
  RestoreRepository,
  RestoreRowCountsRow,
  WishlistItemListRow,
  WishlistItemUpdate,
  WishlistRepository,
} from './repositories';

export type {
  BeautyEventRow,
  BusinessDate,
  CatalogFavoriteRow,
  InstitutionRow,
  Migration,
  PersonRow,
  PersonStatus,
  ProfileRow,
  PurchaseItemCategory,
  PurchaseItemRow,
  PurchaseKind,
  PurchaseRow,
  SqliteBoolean,
  UsageRecordRow,
  UsageSourceKind,
  UsageStatus,
  UtcTimestamp,
  WishlistItemRow,
} from './types';
