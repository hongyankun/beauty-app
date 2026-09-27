/**
 * v3 → v4 的共享映射（DATA_MODEL_V4 第 10.3、10.4、11.3 节）。
 *
 * 只由 v4 迁移与备份 v1 → v2 转换使用。新建与编辑记录不得调用这里的映射：
 * 城市映射表与跨分类白名单只属于这一次旧数据升级。
 */

export {
  buildSelfPerson,
  legacyAllocatedAmount,
  LegacyConversionError,
  mapLegacyItem,
  selfPersonIdFor,
  toV4EventAndUsage,
  toV4Institution,
  toV4Purchase,
  toV4PurchaseItem,
} from './convert';
export type { LegacyItemMapping } from './convert';
export { legacyCityTableDigest, legacyCityTableEntries, mapLegacyCity } from './city-map';
export type { LegacyCityMatch } from './city-map';
export type {
  InstitutionRowV3,
  PurchaseItemRowV3,
  PurchaseRowV3,
  RedemptionRecordRowV3,
  RedemptionStatusV3,
} from './v3-types';
