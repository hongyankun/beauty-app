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
 * 心愿：用户主动记下的、以后想进一步了解或体验的项目。
 *
 * 只保存用户自己填的内容。没有完成状态、优先级与提醒；
 * 也不保存机构名称快照——心愿指向的是「现在还想去的那家机构」，
 * 展示时读机构当前名称（与购买、核销的历史快照口径相反，PRD 第 11 章）。
 */
export type WishlistItemRow = {
  id: string;
  profile_id: string;
  name: string;
  /** 选填。取值复用套餐项目的分类，不另建同义分类体系。 */
  category: PurchaseItemCategory | null;
  /** 选填。只能引用已有机构，机构归档后既有关联仍然保留。 */
  institution_id: string | null;
  /** 选填的计划日期，允许早于今天。 */
  planned_on: BusinessDate | null;
  /** 选填的预算，整数分，允许为 0，不允许为负（ADR-006）。 */
  budget_minor: number | null;
  notes: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
};

/**
 * 一条百科收藏。
 *
 * 只保存「谁收藏了哪篇文章」这个事实：文章正文、标题、摘要与分类都随 App 打包，
 * 属于本地只读内容，复制进数据库只会在内容更新后留下两份互相矛盾的版本。
 * 因此这里存的是稳定的文章 slug，展示时再回本地内容里取当前文本。
 *
 * 没有备注、没有排序位、没有文件夹、没有阅读状态：首版收藏只有「收了 / 没收」。
 */
export type CatalogFavoriteRow = {
  profile_id: string;
  /** 本地百科文章的稳定 slug。不是外键：被引用的一侧不在数据库里。 */
  article_slug: string;
  created_at: UtcTimestamp;
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
