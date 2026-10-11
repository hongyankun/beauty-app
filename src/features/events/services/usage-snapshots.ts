import { findServiceByCode, normalizeServiceName } from '@/data/service-catalog';
import type {
  BeautyEventRow,
  InstitutionRow,
  PurchaseKind,
  UsageRecordRow,
  UsageSourceKind,
} from '@/db';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';

/**
 * 变美记录与使用记录的快照规则（DATA_MODEL_V4 第 4.5、4.6、5.5 节），新建、编辑与修正来源共用。
 *
 * 纯函数：不读库、不写库。快照的来源（机构此刻的地点、项目此刻的名称）由调用方在事务内读好传进来。
 */

/** 来源类型由购买类型决定（第 5.1 节）：套餐 → 套餐项目，单次 → 单次购买。 */
export const SOURCE_KIND_BY_PURCHASE_KIND = {
  package: 'package_item',
  single: 'single_purchase',
} as const satisfies Record<PurchaseKind, UsageSourceKind>;

/** 变美记录上与机构有关的六列。 */
export type EventInstitutionColumns = Pick<
  BeautyEventRow,
  | 'institution_id'
  | 'institution_name_snapshot'
  | 'province_code_snapshot'
  | 'province_name_snapshot'
  | 'city_code_snapshot'
  | 'city_name_snapshot'
>;

/**
 * 地点快照取自机构（第 4.5 节）：把机构此刻的省、市代码与名称依次复制过来；没有机构时全部为空。
 *
 * 事件表单不单独选择省市。机构自己的地点由机构表的 CHECK 保证成对完整，原样复制即满足事件表的 CHECK。
 */
export function eventInstitutionColumns(institution: InstitutionRow | null): EventInstitutionColumns {
  if (institution === null) {
    return {
      institution_id: null,
      institution_name_snapshot: null,
      province_code_snapshot: null,
      province_name_snapshot: null,
      city_code_snapshot: null,
      city_name_snapshot: null,
    };
  }
  return {
    institution_id: institution.id,
    institution_name_snapshot: institution.name,
    province_code_snapshot: institution.province_code,
    province_name_snapshot: institution.province_name,
    city_code_snapshot: institution.city_code,
    city_name_snapshot: institution.city,
  };
}

/** 使用记录上「做了什么项目」的四列快照。 */
export type UsageServiceColumns = Pick<
  UsageRecordRow,
  'category_code_snapshot' | 'service_code_snapshot' | 'service_name_snapshot' | 'custom_name_snapshot'
>;

/**
 * 来源是套餐项目或单次购买时，项目快照取自项目此刻的身份三列。
 *
 * 与快速核销（`create-redemption`）的口径相同：目录名称取目录当前名称，目录不认识的代码退回项目名称；
 * 自定义项目的自定义名称缺失时（只可能来自旧数据）退回项目名称，保证「代码或自定义名称至少有一个」。
 */
export function usageServiceColumnsFromItem(item: {
  readonly name: string;
  readonly category_code: string;
  readonly service_code: string | null;
  readonly custom_name: string | null;
}): UsageServiceColumns {
  return {
    category_code_snapshot: item.category_code,
    service_code_snapshot: item.service_code,
    service_name_snapshot:
      item.service_code === null ? null : (findServiceByCode(item.service_code)?.displayName ?? item.name),
    custom_name_snapshot: item.service_code === null ? (item.custom_name ?? item.name) : item.custom_name,
  };
}

/**
 * 外部来源与暂不关联时，项目快照取自这一行刚选的项目（已经通过严格校验的新选择）。
 * 目录项目没有自定义名称，自定义项目没有代码与目录名称。
 */
export function usageServiceColumnsFromSelection(service: PurchaseItemIdentity): UsageServiceColumns {
  return {
    category_code_snapshot: service.categoryCode,
    service_code_snapshot: service.serviceCode,
    service_name_snapshot:
      service.serviceCode === null ? null : (findServiceByCode(service.serviceCode)?.displayName ?? null),
    custom_name_snapshot: service.serviceCode === null ? service.customName : null,
  };
}

/** 一个新选择的项目在界面与单次购买里用的名称：目录项目取目录名称，自定义取自定义名称。 */
export function selectionDisplayName(service: PurchaseItemIdentity): string {
  if (service.serviceCode !== null) {
    return findServiceByCode(service.serviceCode)?.displayName ?? '';
  }
  return service.customName ?? '';
}

/**
 * 修正来源时目标购买项目与这条记录是否「同一个项目」（第 5.5 节）。
 *
 * - 记录是目录项目：目标代码完全相同。
 * - 记录是自定义项目：目标没有代码、分类相同、自定义名称按项目统一归一化后完全相同
 *   （与机构、人名判重同一规则）。
 * 不看显示名称、目录名称与别名，不做任何模糊匹配；目录项目与自定义项目永不互相兼容。
 */
export function isCompatibleTarget(
  usage: Pick<UsageRecordRow, 'category_code_snapshot' | 'service_code_snapshot' | 'custom_name_snapshot'>,
  target: { readonly category_code: string; readonly service_code: string | null; readonly custom_name: string | null },
): boolean {
  if (usage.service_code_snapshot !== null) {
    return target.service_code === usage.service_code_snapshot;
  }
  if (target.service_code !== null || target.custom_name === null || usage.custom_name_snapshot === null) {
    return false;
  }
  return (
    target.category_code === usage.category_code_snapshot &&
    normalizeServiceName(target.custom_name) === normalizeServiceName(usage.custom_name_snapshot)
  );
}

/** 一个项目身份按第 5.5 节的规则是否与购买项目是「同一个项目」。界面筛选与 service 校验共用。 */
export function identityMatchesItem(
  identity: PurchaseItemIdentity,
  item: { readonly category_code: string; readonly service_code: string | null; readonly custom_name: string | null },
): boolean {
  return isCompatibleTarget(
    {
      category_code_snapshot: identity.categoryCode,
      service_code_snapshot: identity.serviceCode,
      custom_name_snapshot: identity.customName,
    },
    item,
  );
}

/** 项目身份三列是否与库里的这一行逐字相同（「原样继承」，不经目录重新校验）。 */
export function isStoredIdentity(
  identity: PurchaseItemIdentity,
  item: { readonly category_code: string; readonly service_code: string | null; readonly custom_name: string | null },
): boolean {
  return (
    identity.categoryCode === item.category_code &&
    identity.serviceCode === item.service_code &&
    identity.customName === item.custom_name
  );
}

/** 去掉首尾空白；空串记为 null（备注「没填」与「填了空串」不是两件事）。 */
export function optionalNotes(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
