import type {
  BusinessDate,
  InstitutionRow,
  PurchaseItemCategory,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  RedemptionStatus,
  UtcTimestamp,
} from '../types';

/**
 * repository 层的对外契约。
 *
 * service 只依赖本文件里的**类型**，不依赖 expo-sqlite 实现（ARCHITECTURE 第三节）。
 * Phase 3 换成「本地缓存 + 云端权威」时，替换的是实现，service 与页面不动。
 */

/** 机构选择器需要的最小字段集，不返回整行。 */
export type InstitutionOption = {
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
};

export type InstitutionRepository = {
  /** 当前档案下未归档的机构，按名称升序，供选择器复用（PRD-INST-002）。 */
  listSelectable(profileId: string): Promise<InstitutionOption[]>;
  /** 按判重键查找已有机构；用于「同名则复用，不重复创建」。 */
  findByNormalizedName(profileId: string, normalizedName: string): Promise<InstitutionRow | null>;
  /** 按 ID 查找，同时校验归属于该档案。 */
  findById(profileId: string, institutionId: string): Promise<InstitutionRow | null>;
  insert(row: InstitutionRow): Promise<void>;
};

/**
 * 套餐列表的查询结果行。
 *
 * 项目数、总购买次数与有效核销数由 SQL 聚合得出，`remaining` 不在这里计算、
 * 更不落库，由 service 层派生（ADR-013、ARCHITECTURE 第四节）。
 */
export type PurchaseSummaryRow = {
  readonly id: string;
  readonly name: string;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly purchase_date: BusinessDate;
  readonly total_amount_minor: number;
  readonly currency: string;
  readonly expires_on: BusinessDate | null;
  readonly created_at: UtcTimestamp;
  readonly item_count: number;
  readonly total_quantity: number;
  readonly active_redemption_count: number;
};

export type PurchaseRepository = {
  /** 按购买日期倒序、同日按创建时间倒序返回全部套餐概览。 */
  listSummaries(profileId: string): Promise<PurchaseSummaryRow[]>;
  /** 按 ID 读取单个套餐，同时校验归属于该档案；不存在时返回 null。 */
  findById(profileId: string, purchaseId: string): Promise<PurchaseRow | null>;
  /**
   * 套餐下的全部项目及各自的有效核销数，按录入顺序返回。
   *
   * 不带 `profileId`：调用方必须先用 `findById` 确认套餐归属，再用同一个
   * `purchaseId` 取项目。项目本身没有档案列，在这里再 JOIN 一次套餐只会
   * 重复一次同样的校验。
   */
  listItemDetails(purchaseId: string): Promise<PurchaseItemDetailRow[]>;
  /** 读取单个项目及其所属套餐的机构与有效期，同时校验档案归属。 */
  findItemContext(profileId: string, purchaseItemId: string): Promise<PurchaseItemContextRow | null>;
  insert(row: PurchaseRow): Promise<void>;
  insertItems(rows: readonly PurchaseItemRow[]): Promise<void>;
};

/**
 * 套餐详情中的一个项目：项目字段 + 该项目的有效核销数。
 *
 * 与列表一样，`remaining` 不在这里出现——它由 service 用
 * `quantity - active_redemption_count` 派生（ADR-013）。
 */
export type PurchaseItemDetailRow = {
  readonly id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  readonly quantity: number;
  readonly unit_amount_minor: number;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
  readonly active_redemption_count: number;
};

/**
 * 核销表单需要的项目上下文：项目本身，加上它所属套餐的机构快照与有效期。
 *
 * 刻意**不含**有效核销数：核销事务要求「事务内重新读取项目」与「事务内统计
 * 有效核销数」是两步独立的读取（任务书第八节），把计数混进来会让人以为
 * 这一行里的数字可以直接用来判断余次。
 */
export type PurchaseItemContextRow = {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly purchase_id: string;
  readonly purchase_name: string;
  readonly purchase_date: BusinessDate;
  readonly expires_on: BusinessDate | null;
  readonly institution_id: string | null;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
};

/** 套餐详情中的一条核销历史：核销字段 + 所属项目名称。 */
export type RedemptionHistoryRow = {
  readonly id: string;
  readonly purchase_item_id: string;
  readonly item_name: string;
  readonly redeemed_on: BusinessDate;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly status: RedemptionStatus;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
};

export type RedemptionRepository = {
  /**
   * 某个项目的有效核销数（只数 `status = 'active'`）。
   *
   * 这是余次的唯一依据。在事务内调用时，它读到的是事务快照，
   * 与随后插入的那条记录处在同一个原子区间。
   */
  countActiveByItem(purchaseItemId: string): Promise<number>;
  /** 套餐下的全部核销记录，按核销日期倒序、同日按创建时间倒序。 */
  listByPurchase(purchaseId: string): Promise<RedemptionHistoryRow[]>;
  insert(row: RedemptionRecordRow): Promise<void>;
};

/** 一组绑定在同一个连接（或同一个事务）上的 repository。 */
export type RepositoryBundle = {
  readonly institutions: InstitutionRepository;
  readonly purchases: PurchaseRepository;
  readonly redemptions: RedemptionRepository;
};

/**
 * 数据访问入口。
 *
 * 直接读取用 bundle 上的成员；需要多表原子写入时用 `transaction`，
 * 回调里拿到的是绑定在事务连接上的另一组 repository，出了回调即失效。
 */
export type DataAccess = RepositoryBundle & {
  transaction<T>(task: (repositories: RepositoryBundle) => Promise<T>): Promise<T>;
};
