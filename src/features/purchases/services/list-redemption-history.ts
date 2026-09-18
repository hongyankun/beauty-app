import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type RedemptionStatusFilter,
  type UtcTimestamp,
} from '@/db';
import { businessDateMonthKey, formatBusinessMonthLabel } from '@/utils/business-date';

/**
 * 完整核销历史查询用例。
 *
 * 职责边界：repository 给数据库事实（哪些行、什么顺序），这里把它翻译成
 * 页面能直接渲染的结构——状态映射成中文、机构空值兜底、按自然月份分组
 * （ARCHITECTURE 第三节、任务书第十一节）。
 *
 * 本轮只「看历史」：不在这里撤销、编辑或删除任何记录。
 */

/** 页面上的三个筛选，用用户语言表达，不暴露 `active` / `void`（PRD-RED-010）。 */
export type RedemptionHistoryFilter = 'all' | 'valid' | 'voided';

/**
 * 界面筛选 → 数据库状态条件。
 *
 * 这张表是两套词汇之间唯一的翻译点。页面只认左边，repository 只认右边，
 * 中间不再有第三种写法（任务书第十一节）。
 */
const STATUS_FILTERS: Readonly<Record<RedemptionHistoryFilter, RedemptionStatusFilter>> = {
  all: 'all',
  valid: 'active',
  voided: 'void',
};

/** 机构快照为空时的占位文案。核销当时没记机构是常态，不是错误（任务书第七节）。 */
const NO_INSTITUTION = '未填写机构';

export type RedemptionHistoryEntry = {
  readonly id: string;
  /** 所属套餐，点击整条记录时跳到它的详情页 */
  readonly purchaseId: string;
  readonly purchaseItemId: string;
  /** 项目名称，卡片主标题 */
  readonly itemName: string;
  readonly purchaseName: string;
  readonly redeemedOn: BusinessDate;
  /** 是否已撤销。页面据此切换标签与灰度，不去读数据库状态值 */
  readonly isVoided: boolean;
  /** 「有效」或「已撤销」，可直接渲染 */
  readonly statusLabel: string;
  /** 核销当时的机构名称快照；没有值时已兜底为「未填写机构」 */
  readonly institutionLabel: string;
  /** 核销当时的城市快照；没有值时为 null，整段省略，不补占位 */
  readonly city: string | null;
  readonly notes: string | null;
  readonly createdAt: UtcTimestamp;
  /** 撤销时间；仍然有效的记录为 null */
  readonly voidedAt: UtcTimestamp | null;
  /** 撤销原因；用户没填时为 null，不编造默认原因 */
  readonly voidReason: string | null;
};

/** 一个自然月份的分组。分组只用于展示，不改变任何记录的业务日期。 */
export type RedemptionHistorySection = {
  /** `YYYY-MM`，仅作 key */
  readonly key: string;
  /** 例如「2026年9月」 */
  readonly title: string;
  readonly data: readonly RedemptionHistoryEntry[];
};

export type RedemptionHistoryResult = {
  /** 这份结果对应哪个筛选。页面用它确认拿到的是不是当前选中的那一份 */
  readonly filter: RedemptionHistoryFilter;
  /** 当前筛选下的真实条数，等于各分组条数之和 */
  readonly totalCount: number;
  readonly sections: readonly RedemptionHistorySection[];
};

/**
 * 读取当前档案下的全部核销历史。
 *
 * 过滤与排序都由 SQL 完成，这里不再重排：`redeemed_on DESC, created_at DESC, id DESC`
 * 已经是稳定顺序，在 JS 里二次排序只会多一次 O(n log n) 且容易写出不一致的比较。
 *
 * 其他档案的数据读不到：`profile_id` 条件在 SQL 里（ADR-015）。
 * 已被永久删除的套餐也读不到：那些记录已随套餐物理消失（ADR-016）。
 */
export async function listRedemptionHistory(
  dataAccess: DataAccess,
  filter: RedemptionHistoryFilter,
): Promise<RedemptionHistoryResult> {
  const rows = await dataAccess.redemptions.listHistory(
    DEFAULT_PROFILE_ID,
    STATUS_FILTERS[filter],
  );

  const sections: RedemptionHistorySection[] = [];
  /** 当前正在累积的那一组。行已经按日期倒序排好，同月一定是连续的。 */
  let current: { key: string; title: string; data: RedemptionHistoryEntry[] } | null = null;

  for (const row of rows) {
    const isVoided = row.status === 'void';
    const entry: RedemptionHistoryEntry = {
      id: row.id,
      purchaseId: row.purchase_id,
      purchaseItemId: row.purchase_item_id,
      itemName: row.item_name,
      purchaseName: row.purchase_name,
      redeemedOn: row.redeemed_on,
      isVoided,
      statusLabel: isVoided ? '已撤销' : '有效',
      // 机构与城市来自核销记录自己的快照列，不是套餐现在的机构（PRD-INST-005）。
      institutionLabel: row.institution_name_snapshot ?? NO_INSTITUTION,
      city: row.city_snapshot,
      notes: row.notes,
      createdAt: row.created_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
    };

    // 纯字符串取月份，不经过 Date，避免 YYYY-MM-DD 被当成 UTC 解析后偏一天。
    const key = businessDateMonthKey(row.redeemed_on);
    if (current === null || current.key !== key) {
      current = { key, title: formatBusinessMonthLabel(key), data: [] };
      sections.push(current);
    }
    current.data.push(entry);
  }

  return {
    filter,
    // 条数来自真实查询结果，不做任何估算（任务书第九节）。
    totalCount: rows.length,
    sections,
  };
}
