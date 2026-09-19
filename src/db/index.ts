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
  PURCHASE_ITEM_CATEGORIES,
  REDEMPTION_STATUSES,
} from './constants';

export { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

export { DatabaseInitializationError, initializeDatabase } from './initialize-database';

export { createDataAccess } from './repositories';

export type {
  DashboardRepository,
  DashboardTotalsRow,
  DataAccess,
  DatedPurchaseItemFactRow,
  InstitutionConflictRow,
  InstitutionOption,
  InstitutionRepository,
  InstitutionUpdate,
  InstitutionUsageRow,
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
  WishlistItemListRow,
  WishlistItemUpdate,
  WishlistRepository,
} from './repositories';

export type {
  BusinessDate,
  InstitutionRow,
  Migration,
  ProfileRow,
  PurchaseItemCategory,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  RedemptionStatus,
  SqliteBoolean,
  UtcTimestamp,
  WishlistItemRow,
} from './types';
