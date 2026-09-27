import {
  buildSelfPerson,
  LegacyConversionError,
  toV4EventAndUsage,
  toV4Institution,
  toV4Purchase,
  toV4PurchaseItem,
  type PurchaseItemRowV3,
  type PurchaseRowV3,
} from '@/db/legacy-mapping';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_V2_SCHEMA_VERSION,
  type BackupDocument,
  type BackupDocumentV1,
} from '../backup-document';

/**
 * 把一份已通过格式 1 校验的备份转换为格式 2（DATA_MODEL_V4 第 11.3 节）。
 *
 * 纯函数：不碰数据库、时钟与文件系统，不修改入参。逐行规则与 v3 → v4 迁移共用
 * `legacy-mapping`，因此「恢复 v1 备份」与「直接升级同一份数据」得到同样的结果
 * （PRD-V4-003）。每条旧核销变成一条变美记录加一条使用记录，标识沿用核销的标识；
 * 不合并、不自动平衡金额、不用 aliases 猜测项目。
 *
 * 关联对不上时抛 `LegacyConversionError`，由调用方转换为「备份内容不完整或存在关联错误」。
 * 转换结果仍须再过一遍格式 2 的完整校验，这里不替代校验。
 */
export function convertBackupV1ToV2(v1: BackupDocumentV1): BackupDocument {
  const self = buildSelfPerson(v1.profile);

  const itemsById = new Map<string, PurchaseItemRowV3>(v1.purchaseItems.map((item) => [item.id, item]));
  const purchasesById = new Map<string, PurchaseRowV3>(v1.purchases.map((purchase) => [purchase.id, purchase]));

  const purchases = sortByCreated(v1.purchases.map((purchase) => toV4Purchase(purchase, self)));
  const purchaseOrder = orderIndex(purchases);
  const purchaseItems = sortWithin(
    v1.purchaseItems.map(toV4PurchaseItem),
    (item) => purchaseOrder.get(item.purchase_id) ?? Number.MAX_SAFE_INTEGER,
  );

  const converted = v1.redemptionRecords.map((redemption) => {
    const item = itemsById.get(redemption.purchase_item_id);
    const purchase = item === undefined ? undefined : purchasesById.get(item.purchase_id);
    if (item === undefined || purchase === undefined) {
      throw new LegacyConversionError('核销指向不存在的套餐项目');
    }
    return toV4EventAndUsage(redemption, item, purchase, self);
  });
  const beautyEvents = sortByCreated(converted.map((pair) => pair.event));
  const eventOrder = orderIndex(beautyEvents);
  const usageRecords = sortWithin(
    converted.map((pair) => pair.usage),
    (usage) => eventOrder.get(usage.event_id) ?? Number.MAX_SAFE_INTEGER,
  );

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: v1.exportedAt,
    databaseSchemaVersion: BACKUP_V2_SCHEMA_VERSION,
    profile: { ...v1.profile },
    people: [self],
    institutions: sortByCreated(v1.institutions.map(toV4Institution)),
    purchases,
    purchaseItems,
    beautyEvents,
    usageRecords,
    wishlistItems: sortByCreated(v1.wishlistItems.map((wish) => ({ ...wish }))),
    catalogFavorites: [...v1.catalogFavorites]
      .map((favorite) => ({ ...favorite }))
      .sort((a, b) => compareText(a.created_at, b.created_at) || compareText(a.article_slug, b.article_slug)),
  };
}

type Created = { readonly id: string; readonly created_at: string };

/**
 * 与导出的 `ORDER BY created_at ASC, id ASC` 一致。
 *
 * 用码元比较而不是 `localeCompare`：SQLite 默认的 BINARY 排序就是按字节比较，
 * 时间戳与 UUID 都是 ASCII，两者结果相同；按区域设置排序则可能不同。
 */
function sortByCreated<T extends Created>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => compareText(a.created_at, b.created_at) || compareText(a.id, b.id));
}

/** 子行先按父行在导出中的位置，再按自身的创建时间与标识，与导出的 JOIN 排序一致。 */
function sortWithin<T extends Created>(rows: readonly T[], parentIndex: (row: T) => number): T[] {
  return [...rows].sort(
    (a, b) =>
      parentIndex(a) - parentIndex(b) || compareText(a.created_at, b.created_at) || compareText(a.id, b.id),
  );
}

function orderIndex(rows: readonly Created[]): Map<string, number> {
  return new Map(rows.map((row, index) => [row.id, index]));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
