import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';
import { compareBusinessDates, differenceInCalendarDays } from '@/utils/business-date';

/**
 * 套餐临期与过期提醒的查询用例。
 *
 * repository 只给「有有效期的套餐及其项目数量事实」，是哪天、还剩几天、
 * 算不算临期，全部在这里派生（任务书第十节）。数据库里不存 remaining，
 * 也不存 daysRemaining 与提醒状态——它们随今天的日期变化，落库就会立刻过时。
 *
 * 本用例只读：提醒不改变任何业务规则，过期套餐照常可以核销（ADR-017）。
 */

/** 提醒窗口：未来 30 个自然日（PRD 第 8.4 节）。第一版固定，不可配置。 */
export const EXPIRING_WINDOW_DAYS = 30;

/** 首页提醒区最多展示几个套餐（PRD 第 8.4 节）。 */
export const HOME_REMINDER_LIMIT = 3;

/** 机构快照为空时的统一说法：陈述事实，不编造机构名。 */
const NO_INSTITUTION = '未填写机构';

/**
 * 提醒状态。三者互斥，且都隐含「仍有剩余次数」。
 *
 * 不含「暂不提醒」：那类套餐根本不会出现在结果里，给它一个状态值
 * 只会让调用方以为还需要自己过滤一遍。
 */
export type ExpiringStatus =
  /** 有效期早于今天 */
  | 'expired'
  /** 有效期正好是今天。不算已过期（任务书第四节） */
  | 'dueToday'
  /** 有效期在今天之后、且不超过 30 个自然日 */
  | 'dueSoon';

export type ExpiringPurchase = {
  readonly id: string;
  readonly name: string;
  /** 套餐录入当时的机构名称快照；为空时已兜底为「未填写机构」 */
  readonly institutionLabel: string;
  /** 套餐录入当时的城市快照；为空时整段省略，不补占位 */
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  readonly expiresOn: BusinessDate;
  /** 派生值：各项目 `max(0, 购买次数 − 有效核销数)` 之和，必定大于 0 */
  readonly remaining: number;
  readonly status: ExpiringStatus;
  /**
   * 今天到有效期之间的自然日差，过期为负。
   *
   * 页面用 `statusLabel` 就够了，这个字段用于排序与调试，
   * 不要在界面上直接渲染裸数字。
   */
  readonly daysUntilExpiry: number;
  /** 例如「已过期8天」「今天到期」「明天到期」「12天后到期」 */
  readonly statusLabel: string;
};

export type ExpiringPurchaseResult = {
  /** 这份结果是按哪一天算出来的。页面据此确认拿到的不是跨天前的旧结果 */
  readonly today: BusinessDate;
  /** 已过期且仍有余次，按有效期倒序（最近过期的在前） */
  readonly expired: readonly ExpiringPurchase[];
  /** 今天到期与 30 天内到期，按有效期升序（最早到期的在前） */
  readonly dueSoon: readonly ExpiringPurchase[];
  /**
   * 两段拼起来的紧急度顺序：已过期在前，其后是最早到期的。
   *
   * 首页取前 `HOME_REMINDER_LIMIT` 条，完整页按两个区块分开展示，
   * 两处的先后顺序因此天然一致。
   */
  readonly all: readonly ExpiringPurchase[];
  readonly totalCount: number;
};

/** 同一个套餐的若干项目行在这里先攒成一条。 */
type Draft = {
  readonly id: string;
  readonly name: string;
  readonly institutionLabel: string;
  readonly city: string | null;
  readonly purchaseDate: BusinessDate;
  readonly expiresOn: BusinessDate;
  remaining: number;
};

/**
 * 提醒文案（任务书第六节）。
 *
 * 只陈述日期事实，不出现「该做了」「快用完」这类催促或医疗判断
 * （PRD 第 12.1 节、PRD-NFR-002）。调用方负责在旁边同时显示具体日期，
 * 不能只给相对时间。
 */
function statusLabelFor(days: number): string {
  if (days < 0) {
    return `已过期${-days}天`;
  }
  if (days === 0) {
    return '今天到期';
  }
  if (days === 1) {
    return '明天到期';
  }
  return `${days}天后到期`;
}

function statusFor(days: number): ExpiringStatus {
  if (days < 0) {
    return 'expired';
  }
  return days === 0 ? 'dueToday' : 'dueSoon';
}

/** ID 升序，排序的最后一道兜底，保证两次查询的顺序完全一致。 */
function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * 读取当前档案下需要提醒的套餐。
 *
 * `today` 由调用方传入（hook 用设备本地日历取），service 不自己读时钟：
 * 这样这个函数是纯粹可预期的，验证任意一天的边界只需要换一个入参。
 *
 * 其他档案的数据读不到：`profile_id` 条件写在 SQL 里（ADR-015）。
 */
export async function listExpiringPurchases(
  dataAccess: DataAccess,
  today: BusinessDate,
): Promise<ExpiringPurchaseResult> {
  const rows = await dataAccess.purchases.listDatedPurchaseItemFacts(DEFAULT_PROFILE_ID);

  // 先按套餐归并。剩余次数**按项目分别夹零再累加**：某个项目被多核销了一次
  // （异常数据）只会让它自己记 0，不会去抵消别的项目还剩下的次数。
  const drafts = new Map<string, Draft>();
  for (const row of rows) {
    let draft = drafts.get(row.purchase_id);
    if (draft === undefined) {
      draft = {
        id: row.purchase_id,
        name: row.purchase_name,
        institutionLabel: row.institution_name_snapshot ?? NO_INSTITUTION,
        city: row.city_snapshot,
        purchaseDate: row.purchase_date,
        expiresOn: row.expires_on,
        remaining: 0,
      };
      drafts.set(row.purchase_id, draft);
    }
    draft.remaining += Math.max(0, row.quantity - row.active_redemption_count);
  }

  const expired: ExpiringPurchase[] = [];
  const dueSoon: ExpiringPurchase[] = [];

  for (const draft of drafts.values()) {
    // 一次都没剩的套餐不提醒，哪怕它已经过期（任务书第三节）：
    // 次数用完本身不是需要用户处理的事。
    if (draft.remaining <= 0) {
      continue;
    }

    const days = differenceInCalendarDays(today, draft.expiresOn);
    // 日期读不出来时跳过而不是当成今天：宁可少提醒一条，
    // 也不要凭一个算不出来的日期去断言「今天到期」。
    if (days === null || days > EXPIRING_WINDOW_DAYS) {
      continue;
    }

    const entry: ExpiringPurchase = {
      id: draft.id,
      name: draft.name,
      institutionLabel: draft.institutionLabel,
      city: draft.city,
      purchaseDate: draft.purchaseDate,
      expiresOn: draft.expiresOn,
      remaining: draft.remaining,
      status: statusFor(days),
      daysUntilExpiry: days,
      statusLabel: statusLabelFor(days),
    };

    if (entry.status === 'expired') {
      expired.push(entry);
    } else {
      dueSoon.push(entry);
    }
  }

  // 排序（任务书第八节）：已过期按有效期倒序，最近过期的排在最前；
  // 30 天内按有效期升序，最早到期的排在最前。同一天再按购买日期倒序，
  // 最后按 ID 升序兜底——没有这一层，同日同价的两个套餐每次顺序都可能不同。
  expired.sort(
    (left, right) =>
      compareBusinessDates(right.expiresOn, left.expiresOn) ||
      compareBusinessDates(right.purchaseDate, left.purchaseDate) ||
      compareIds(left.id, right.id),
  );
  dueSoon.sort(
    (left, right) =>
      compareBusinessDates(left.expiresOn, right.expiresOn) ||
      compareBusinessDates(right.purchaseDate, left.purchaseDate) ||
      compareIds(left.id, right.id),
  );

  const all = [...expired, ...dueSoon];

  return {
    today,
    expired,
    dueSoon,
    all,
    totalCount: all.length,
  };
}
