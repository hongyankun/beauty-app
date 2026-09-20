import type { SQLiteDatabase } from 'expo-sqlite';

import { runInTransaction } from '../run-in-transaction';
import { createBackupRepository } from './backup-repository';
import { createCatalogFavoriteRepository } from './catalog-favorite-repository';
import { createDashboardRepository } from './dashboard-repository';
import { createInstitutionRepository } from './institution-repository';
import { createPurchaseRepository } from './purchase-repository';
import { createRedemptionRepository } from './redemption-repository';
import { createRestoreRepository } from './restore-repository';
import type { DataAccess, RepositoryBundle } from './types';
import { createWishlistRepository } from './wishlist-repository';

/** 把一组 repository 绑定到给定连接上。事务内外用的是同一份构造逻辑。 */
function createRepositoryBundle(db: SQLiteDatabase): RepositoryBundle {
  return {
    institutions: createInstitutionRepository(db),
    purchases: createPurchaseRepository(db),
    redemptions: createRedemptionRepository(db),
    dashboard: createDashboardRepository(db),
    wishlist: createWishlistRepository(db),
    catalogFavorites: createCatalogFavoriteRepository(db),
    backup: createBackupRepository(db),
    restore: createRestoreRepository(db),
  };
}

/**
 * 从一个数据库连接构造数据访问入口。
 *
 * 这是 SQLite 泄漏到上层的最后一站：再往上（service、hook、页面）只看得见
 * `DataAccess` 这个接口，看不到 `SQLiteDatabase`。
 */
export function createDataAccess(db: SQLiteDatabase): DataAccess {
  return {
    ...createRepositoryBundle(db),
    transaction: (task) => runInTransaction(db, (txn) => task(createRepositoryBundle(txn))),
  };
}
