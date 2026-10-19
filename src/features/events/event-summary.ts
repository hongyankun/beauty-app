import type { BeautyEventRow, EventUsageSummaryRow } from '@/db';

/**
 * 变美记录的列表摘要（BT-0024 裁决 5、7）。纯函数，变美历史与首页「最近变美」共用这一份，不复制第二套算法。
 *
 * 只读保存时的快照：项目名称取使用记录上的快照，机构与地点取变美记录上的快照，
 * 从不查询当前目录、机构或人员补名，改名不会改变历史的显示。
 */

/** 快照里一个名称都没有时（只可能来自异常数据）的安全兜底，不去当前目录补名。 */
export const UNNAMED_SERVICE_LABEL = '未命名项目';

/** 最多展示的不同项目数。 */
export const SUMMARY_MAX_SERVICES = 3;

/** 一条使用记录的项目名称：目录名称快照 → 自定义名称快照 → 套餐项目名称快照 → 兜底文字。 */
export function usageServiceName(
  usage: Pick<
    EventUsageSummaryRow,
    'service_name_snapshot' | 'custom_name_snapshot' | 'purchase_item_name_snapshot'
  >,
): string {
  const candidates = [usage.service_name_snapshot, usage.custom_name_snapshot, usage.purchase_item_name_snapshot];
  for (const candidate of candidates) {
    if (candidate !== null && candidate.trim() !== '') {
      return candidate;
    }
  }
  return UNNAMED_SERVICE_LABEL;
}

/**
 * 项目摘要：按名称快照归并，顺序取每个名称在事件中首次出现的位置，不按字母重排。
 * 同名出现多次显示「名称 ×N」；最多展示 3 个不同名称，超过时追加「等 N 种项目」，N 是不同名称的总数。
 */
export function summarizeServices(
  usages: readonly Pick<
    EventUsageSummaryRow,
    'service_name_snapshot' | 'custom_name_snapshot' | 'purchase_item_name_snapshot'
  >[],
): string {
  const counts = new Map<string, number>();
  for (const usage of usages) {
    const name = usageServiceName(usage);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return '没有项目';
  }
  const labels = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
  const shown = labels.slice(0, SUMMARY_MAX_SERVICES).join('、');
  return counts.size > SUMMARY_MAX_SERVICES ? `${shown} 等 ${counts.size} 种项目` : shown;
}

/** 撤销摘要：没有撤销时为 null；部分撤销为「其中 M 条已撤销」；全部撤销为「已全部撤销」。 */
export function summarizeVoids(usages: readonly Pick<EventUsageSummaryRow, 'status'>[]): string | null {
  const voided = usages.filter((usage) => usage.status === 'void').length;
  if (voided === 0) {
    return null;
  }
  return voided === usages.length ? '已全部撤销' : `其中 ${voided} 条已撤销`;
}

/** 地点快照的展示文字，例如「广东省 · 深圳市」；直辖市省市同名时只写一次；没有地点时为 null。 */
export function eventLocationLabel(province: string | null, city: string | null): string | null {
  const parts = [province, city].filter((part): part is string => part !== null && part.trim() !== '');
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length === 0 ? null : unique.join(' · ');
}

/** 变美历史与首页里的一张事件卡。 */
export type BeautyEventCard = {
  readonly id: string;
  readonly occurredOn: string;
  /** 机构名称快照；未填写机构时为 null */
  readonly institutionName: string | null;
  readonly locationLabel: string | null;
  readonly serviceSummary: string;
  readonly voidSummary: string | null;
  readonly usageCount: number;
};

/**
 * 把事件与它们的使用记录组装成事件卡：一条事件恰好一张卡，按传入事件的顺序。
 * 使用记录按 `event_id` 归入各自的事件，不会把不同事件的记录混在一起。
 */
export function buildEventCards(
  events: readonly BeautyEventRow[],
  usages: readonly EventUsageSummaryRow[],
): BeautyEventCard[] {
  const byEvent = new Map<string, EventUsageSummaryRow[]>();
  for (const usage of usages) {
    const list = byEvent.get(usage.event_id);
    if (list === undefined) {
      byEvent.set(usage.event_id, [usage]);
    } else {
      list.push(usage);
    }
  }
  return events.map((event) => {
    const own = byEvent.get(event.id) ?? [];
    return {
      id: event.id,
      occurredOn: event.occurred_on,
      institutionName: event.institution_name_snapshot,
      locationLabel: eventLocationLabel(event.province_name_snapshot, event.city_name_snapshot),
      serviceSummary: summarizeServices(own),
      voidSummary: summarizeVoids(own),
      usageCount: own.length,
    };
  });
}

/** 事件卡的读屏标签：一句完整的话，不把每条明细都读出来。 */
export function eventCardAccessibilityLabel(card: BeautyEventCard): string {
  return [
    card.occurredOn,
    card.institutionName ?? '未填写机构',
    card.locationLabel,
    card.serviceSummary,
    card.voidSummary,
    '查看这次变美',
  ]
    .filter((part): part is string => part !== null)
    .join('，');
}
