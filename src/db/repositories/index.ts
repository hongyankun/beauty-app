/** repository 层出口。上层只从 `@/db` 导入，不直接引用具体实现文件。 */
export { createDataAccess } from './data-access';
export type {
  DataAccess,
  InstitutionOption,
  InstitutionRepository,
  PurchaseDeletionImpactRow,
  PurchaseItemContextRow,
  PurchaseItemDetailRow,
  PurchaseRepository,
  PurchaseSummaryRow,
  RedemptionContextRow,
  RedemptionHistoryRow,
  RedemptionRepository,
  RepositoryBundle,
} from './types';
