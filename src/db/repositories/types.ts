import type { BusinessDate, InstitutionRow, PurchaseItemRow, PurchaseRow, UtcTimestamp } from '../types';

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
  insert(row: PurchaseRow): Promise<void>;
  insertItems(rows: readonly PurchaseItemRow[]): Promise<void>;
};

/** 一组绑定在同一个连接（或同一个事务）上的 repository。 */
export type RepositoryBundle = {
  readonly institutions: InstitutionRepository;
  readonly purchases: PurchaseRepository;
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
