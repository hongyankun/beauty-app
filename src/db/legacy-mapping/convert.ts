import { matchLegacyServiceName } from '@/data/service-catalog';
import { normalizeInstitutionName } from '@/utils/institution-name';

import { DEFAULT_PROFILE_ID, SELF_PERSON_DISPLAY_NAME, SELF_PERSON_ID } from '../constants';
import type {
  BeautyEventRow,
  InstitutionRow,
  PersonRow,
  ProfileRow,
  PurchaseItemRow,
  PurchaseRow,
  UsageRecordRow,
} from '../types';
import { mapLegacyCity } from './city-map';
import type { InstitutionRowV3, PurchaseItemRowV3, PurchaseRowV3, RedemptionRecordRowV3 } from './v3-types';

/**
 * v3 行 → v4 行的纯函数（DATA_MODEL_V4 第 10.3、10.4、11.3 节）。
 *
 * v3 → v4 迁移与备份 v1 → v2 转换**只**通过这里做数据搬运，保证同一份旧数据两条路径结果一致。
 * 函数不读写数据库、不访问文件、不打日志，也不修改入参。
 */

/** 转换中发现旧数据违反 v4 不变量时抛出。消息只写规则，不含任何用户数据。 */
export class LegacyConversionError extends Error {
  constructor(rule: string) {
    super(`旧数据无法按 v4 规则无损转换：${rule}`);
    this.name = 'LegacyConversionError';
  }
}

/**
 * 某个档案下「自己」的 ID。
 *
 * 默认档案使用固定常量 `SELF_PERSON_ID`（DATA_MODEL_V4 第 4.2 节）。第一版只有默认档案，
 * 其他档案只可能出现在测试数据里；它们使用由档案 ID 确定地派生的 ID，迁移可重现。
 */
export function selfPersonIdFor(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? SELF_PERSON_ID : `self-person:${profileId}`;
}

/** 为一个档案生成「自己」：时间戳取档案的 `created_at`，使结果可重现。 */
export function buildSelfPerson(profile: Pick<ProfileRow, 'id' | 'created_at'>): PersonRow {
  return {
    id: selfPersonIdFor(profile.id),
    profile_id: profile.id,
    display_name: SELF_PERSON_DISPLAY_NAME,
    normalized_name: normalizeInstitutionName(SELF_PERSON_DISPLAY_NAME),
    is_self: 1,
    status: 'active',
    created_at: profile.created_at,
    updated_at: profile.created_at,
  };
}

export function toV4Institution(row: InstitutionRowV3): InstitutionRow {
  const location = mapLegacyCity(row.city);
  return {
    id: row.id,
    profile_id: row.profile_id,
    name: row.name,
    normalized_name: row.normalized_name,
    city: row.city,
    notes: row.notes,
    is_archived: row.is_archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
    province_code: location?.provinceCode ?? null,
    province_name: location?.provinceName ?? null,
    city_code: location?.cityCode ?? null,
  };
}

export function toV4Purchase(row: PurchaseRowV3, self: Pick<PersonRow, 'id' | 'display_name'>): PurchaseRow {
  return {
    id: row.id,
    profile_id: row.profile_id,
    purchase_kind: 'package',
    purchaser_person_id: self.id,
    purchaser_name_snapshot: self.display_name,
    institution_id: row.institution_id,
    institution_name_snapshot: row.institution_name_snapshot,
    city_snapshot: row.city_snapshot,
    name: row.name,
    purchase_date: row.purchase_date,
    total_amount_minor: row.total_amount_minor,
    currency: row.currency,
    expires_on: row.expires_on,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 一个旧项目的目录映射结果，项目行与使用记录快照共用。 */
export type LegacyItemMapping = {
  readonly categoryCode: string;
  readonly serviceCode: string | null;
  readonly serviceName: string | null;
  readonly customName: string | null;
};

/**
 * 同分类精确匹配 → 跨分类白名单 → 自定义名称（DATA_MODEL_V4 第 10.4 节）。
 * 命中白名单时一级分类改为目标条目的分类，这是白名单唯一放开的东西。
 */
export function mapLegacyItem(category: string, name: string): LegacyItemMapping {
  const entry = matchLegacyServiceName(category, name);
  if (entry !== null) {
    return { categoryCode: entry.categoryCode, serviceCode: entry.code, serviceName: entry.displayName, customName: null };
  }
  return { categoryCode: category, serviceCode: null, serviceName: null, customName: name };
}

/** `unit × quantity`，超出安全整数范围时拒绝转换，不做任何截断或舍入。 */
export function legacyAllocatedAmount(unitAmountMinor: number, quantity: number): number {
  const allocated = unitAmountMinor * quantity;
  if (!Number.isSafeInteger(allocated) || allocated < 0) {
    throw new LegacyConversionError('项目分配金额超出整数分的安全范围');
  }
  return allocated;
}

export function toV4PurchaseItem(row: PurchaseItemRowV3): PurchaseItemRow {
  const mapping = mapLegacyItem(row.category, row.name);
  return {
    id: row.id,
    purchase_id: row.purchase_id,
    name: row.name,
    category_code: mapping.categoryCode,
    service_code: mapping.serviceCode,
    custom_name: mapping.customName,
    quantity: row.quantity,
    allocated_amount_minor: legacyAllocatedAmount(row.unit_amount_minor, row.quantity),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 一条旧核销 → 一个变美记录 + 一条使用记录，两者 ID 都等于旧核销 ID。
 * 地点取**旧核销自己的**城市快照，不取机构当前地点；核销备注放在使用记录上。
 */
export function toV4EventAndUsage(
  redemption: RedemptionRecordRowV3,
  item: PurchaseItemRowV3,
  purchase: PurchaseRowV3,
  self: Pick<PersonRow, 'id' | 'display_name'>,
): { readonly event: BeautyEventRow; readonly usage: UsageRecordRow } {
  if (redemption.purchase_item_id !== item.id || item.purchase_id !== purchase.id) {
    throw new LegacyConversionError('核销与套餐项目的关联不一致');
  }
  const isActive = redemption.status === 'active';
  if (isActive ? redemption.voided_at !== null || redemption.void_reason !== null : redemption.voided_at === null) {
    throw new LegacyConversionError('核销的撤销字段与状态不一致');
  }

  const location = mapLegacyCity(redemption.city_snapshot);
  const mapping = mapLegacyItem(item.category, item.name);

  const event: BeautyEventRow = {
    id: redemption.id,
    profile_id: purchase.profile_id,
    occurred_on: redemption.redeemed_on,
    institution_id: redemption.institution_id,
    institution_name_snapshot: redemption.institution_name_snapshot,
    province_code_snapshot: location?.provinceCode ?? null,
    province_name_snapshot: location?.provinceName ?? null,
    city_code_snapshot: location?.cityCode ?? null,
    city_name_snapshot: redemption.city_snapshot,
    notes: null,
    created_at: redemption.created_at,
    updated_at: redemption.updated_at,
  };

  const usage: UsageRecordRow = {
    id: redemption.id,
    event_id: redemption.id,
    source_kind: 'package_item',
    purchase_item_id: item.id,
    person_id: self.id,
    person_name_snapshot: self.display_name,
    category_code_snapshot: mapping.categoryCode,
    service_code_snapshot: mapping.serviceCode,
    service_name_snapshot: mapping.serviceName,
    custom_name_snapshot: mapping.customName,
    purchase_name_snapshot: purchase.name,
    purchase_item_name_snapshot: item.name,
    status: redemption.status,
    voided_at: redemption.voided_at,
    void_reason: redemption.void_reason,
    notes: redemption.notes,
    created_at: redemption.created_at,
    updated_at: redemption.updated_at,
  };

  return { event, usage };
}
