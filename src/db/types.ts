import type { SQLiteDatabase } from 'expo-sqlite';

import type { PURCHASE_ITEM_CATEGORIES, REDEMPTION_STATUSES } from './constants';

/**
 * 数据库行类型。
 *
 * 这里的属性名与列名完全一致（snake_case），刻意不做驼峰转换：
 * 它们描述的是「表里存了什么」，不是领域模型。
 * 领域模型与映射属于后续 repository 层，本轮不实现。
 */

/** SQLite 没有布尔类型，统一用 0/1 并在表上加 CHECK 约束。 */
export type SqliteBoolean = 0 | 1;

/** UTC ISO 8601 系统时间戳，例如 `2026-09-14T08:30:00.000Z`。用于全局排序。 */
export type UtcTimestamp = string;

/** `YYYY-MM-DD` 业务日期。购买、核销、到期发生在「哪一天」，跨时区不漂移。 */
export type BusinessDate = string;

export type PurchaseItemCategory = (typeof PURCHASE_ITEM_CATEGORIES)[number];

export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export type ProfileRow = {
  id: string;
  display_name: string;
  is_default: SqliteBoolean;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type InstitutionRow = {
  id: string;
  profile_id: string;
  name: string;
  /** 去除首尾空格并转小写后的名称，用于搜索与排序；不唯一，同名机构允许并存（ADR-014）。 */
  normalized_name: string;
  city: string | null;
  notes: string | null;
  is_archived: SqliteBoolean;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type PurchaseRow = {
  id: string;
  profile_id: string;
  institution_id: string | null;
  /** 录入当时的机构名称快照，机构改名后旧记录仍显示原名（PRD-INST-005）。 */
  institution_name_snapshot: string | null;
  city_snapshot: string | null;
  name: string;
  purchase_date: BusinessDate;
  /** 整数分，不使用浮点数保存金额（ADR-006）。 */
  total_amount_minor: number;
  currency: string;
  /** 为空表示未知或长期有效，不参与临期与过期筛选（PRD-PUR-007）。 */
  expires_on: BusinessDate | null;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type PurchaseItemRow = {
  id: string;
  purchase_id: string;
  name: string;
  category: PurchaseItemCategory;
  /** 购买次数，必须大于 0。 */
  quantity: number;
  /**
   * 分摊单价，整数分，必填；0 表示赠送项目。
   * 项目分摊总额 = `unit_amount_minor × quantity`，由上层派生，不落库。
   */
  unit_amount_minor: number;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

export type RedemptionRecordRow = {
  id: string;
  purchase_item_id: string;
  institution_id: string | null;
  institution_name_snapshot: string | null;
  city_snapshot: string | null;
  redeemed_on: BusinessDate;
  status: RedemptionStatus;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
  /** status 为 void 时必填，active 时必须为空（表级 CHECK 约束保证）。 */
  voided_at: UtcTimestamp | null;
  void_reason: string | null;
};

/**
 * 一次版本迁移。
 *
 * `version` 必须是从 1 开始连续递增的整数，不允许随机值。
 * `up` 收到的是执行迁移的连接；调用方已经把它包在事务里，
 * 迁移内部不要自行 BEGIN / COMMIT。
 *
 * 注：expo-sqlite 的 `Transaction` 类未导出，它继承自 `SQLiteDatabase`，
 * 因此这里用 `SQLiteDatabase` 作为参数类型。
 */
export type Migration = {
  readonly version: number;
  readonly name: string;
  readonly up: (txn: SQLiteDatabase) => Promise<void>;
};
