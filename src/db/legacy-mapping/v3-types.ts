import type { BusinessDate, PurchaseItemCategory, SqliteBoolean, UtcTimestamp } from '../types';

/**
 * schema v3 / 备份 v1 的行类型。
 *
 * 只给两处使用：v3 → v4 迁移读取旧表，以及备份 v1 的校验与 v1 → v2 转换。
 * 业务代码一律使用 `../types.ts` 中的 v4 行类型，不得引用这里。
 */

export type RedemptionStatusV3 = 'active' | 'void';

export type InstitutionRowV3 = {
  id: string;
  profile_id: string;
  name: string;
  normalized_name: string;
  city: string | null;
  notes: string | null;
  is_archived: SqliteBoolean;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type PurchaseRowV3 = {
  id: string;
  profile_id: string;
  institution_id: string | null;
  institution_name_snapshot: string | null;
  city_snapshot: string | null;
  name: string;
  purchase_date: BusinessDate;
  total_amount_minor: number;
  currency: string;
  expires_on: BusinessDate | null;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type PurchaseItemRowV3 = {
  id: string;
  purchase_id: string;
  name: string;
  category: PurchaseItemCategory;
  quantity: number;
  /** 分摊单价，整数分；v4 起由 `allocated_amount_minor = unit_amount_minor × quantity` 取代。 */
  unit_amount_minor: number;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type RedemptionRecordRowV3 = {
  id: string;
  purchase_item_id: string;
  institution_id: string | null;
  institution_name_snapshot: string | null;
  city_snapshot: string | null;
  redeemed_on: BusinessDate;
  status: RedemptionStatusV3;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
  voided_at: UtcTimestamp | null;
  void_reason: string | null;
};
