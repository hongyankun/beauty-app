import { getServiceCategoryDisplayName } from '@/data/service-catalog';
import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type EventUsageRow,
  type UsageSourceKind,
  type UtcTimestamp,
} from '@/db';
import { eventLocationLabel, usageServiceName } from '../event-summary';

/**
 * 变美记录详情的读取用例（BT-0023 裁决 3：操作闭环所需的最小详情）。
 *
 * 一律展示**快照**：事件的机构与地点是当时复制下来的，使用记录的使用人、项目与套餐名称也是
 * 当时的名称。机构、人员、套餐或目录日后改名、改地点或被删除，都不改变这里的显示。
 * 最终的历史浏览与展示体系属于 BT-0024。
 */

export type BeautyEventDetailUsage = {
  readonly id: string;
  readonly sourceKind: UsageSourceKind;
  /** 项目名称：目录名称快照或自定义名称快照 */
  readonly serviceName: string;
  readonly categoryLabel: string;
  /** 来源的一句话说明，例如「套餐「秋季紧致」· 项目「热玛吉」」「外部来源」 */
  readonly sourceLabel: string;
  readonly personName: string;
  readonly notes: string | null;
  readonly isVoided: boolean;
  readonly statusLabel: string;
  readonly voidedAt: UtcTimestamp | null;
  readonly voidReason: string | null;
  /** 来源仍关联一个购买时的购买 ID，用于跳转；外部来源、暂不关联与原套餐已删除时为 null */
  readonly purchaseId: string | null;
  /** 关联购买的购买日期与有效期，仅用于编辑日期时的提示 */
  readonly purchaseDate: BusinessDate | null;
  readonly expiresOn: BusinessDate | null;
};

export type BeautyEventDetail = {
  readonly id: string;
  readonly occurredOn: BusinessDate;
  readonly institutionId: string | null;
  /** 机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  /** 地点快照的展示文字，例如「广东省 · 深圳市」；没有地点时为 null */
  readonly locationLabel: string | null;
  readonly notes: string | null;
  readonly usages: readonly BeautyEventDetailUsage[];
  readonly activeCount: number;
};

const SOURCE_PREFIX: Readonly<Record<UsageSourceKind, string>> = {
  package_item: '套餐',
  single_purchase: '单次购买',
  external: '外部来源',
  unlinked: '暂不关联',
  deleted_package: '原套餐已删除',
};

/** 来源的产品语言说明，不出现任何技术取值（PRD-RED-010）。 */
export function describeUsageSource(
  usage: Pick<EventUsageRow, 'source_kind' | 'purchase_name_snapshot' | 'purchase_item_name_snapshot'>,
): string {
  const prefix = SOURCE_PREFIX[usage.source_kind];
  if (usage.source_kind === 'external' || usage.source_kind === 'unlinked') {
    return prefix;
  }
  const parts = [
    usage.purchase_name_snapshot === null ? null : `「${usage.purchase_name_snapshot}」`,
    usage.purchase_item_name_snapshot === null ? null : `项目「${usage.purchase_item_name_snapshot}」`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? prefix : `${prefix}${parts.join(' · ')}`;
}

/** 读取一条变美记录；不存在或不属于当前档案时返回 null。 */
export async function getBeautyEventDetail(
  dataAccess: DataAccess,
  eventId: string,
): Promise<BeautyEventDetail | null> {
  const event = await dataAccess.events.findEvent(DEFAULT_PROFILE_ID, eventId);
  if (event === null) {
    return null;
  }
  const rows = await dataAccess.events.listEventUsages(event.id);
  const usages = rows.map<BeautyEventDetailUsage>((row) => {
    const isVoided = row.status === 'void';
    return {
      id: row.id,
      sourceKind: row.source_kind,
      serviceName: usageServiceName(row),
      categoryLabel: getServiceCategoryDisplayName(row.category_code_snapshot),
      sourceLabel: describeUsageSource(row),
      personName: row.person_name_snapshot,
      notes: row.notes,
      isVoided,
      statusLabel: isVoided ? '已撤销' : '有效',
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      purchaseId: row.purchase_id,
      purchaseDate: row.purchase_date,
      expiresOn: row.expires_on,
    };
  });

  return {
    id: event.id,
    occurredOn: event.occurred_on,
    institutionId: event.institution_id,
    institutionName: event.institution_name_snapshot,
    locationLabel: eventLocationLabel(event.province_name_snapshot, event.city_name_snapshot),
    notes: event.notes,
    usages,
    activeCount: usages.filter((usage) => !usage.isVoided).length,
  };
}
