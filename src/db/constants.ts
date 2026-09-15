/**
 * 本地数据库的集中常量定义。
 *
 * 数据库文件名、默认档案与默认币种只允许在这里声明一次，
 * 其他位置一律引用本文件，不得另写字面量。
 * schema 版本由 `migrations.ts` 从迁移列表派生，避免两处手工维护产生偏差。
 */

/** SQLite 数据库文件名（expo-sqlite 在应用沙盒的 SQLite 目录下创建）。 */
export const DATABASE_NAME = 'beauty-app.db';

/**
 * 默认档案的固定 ID。
 *
 * 第一版只有当前用户本人一个 Profile（ADR-015）。使用固定 UUID 而不是
 * 运行时随机生成，保证：
 * 1. 初始化后重启 App，默认档案 ID 不变；
 * 2. 配合 `INSERT OR IGNORE` 与主键约束，不可能被创建出第二条。
 */
export const DEFAULT_PROFILE_ID = '00000000-0000-4000-8000-000000000001';

/** 默认档案的显示名。界面上不提供档案管理与切换入口。 */
export const DEFAULT_PROFILE_DISPLAY_NAME = '个人档案';

/**
 * 第一版默认币种（PRD 第 6.1 节）。
 *
 * 币种作为独立列保存而不是写死在列结构里，Q-11（是否支持多币种）仍未决，
 * 未来放开多币种时不需要改表结构。
 */
export const DEFAULT_CURRENCY = 'CNY';

/**
 * 套餐项目分类（PRD 第 6.3 节：光电类、注射类、化学焕肤、中胚层微针、清洁、手术类、其他）。
 *
 * 库里存稳定的 ASCII code，中文显示名属于 UI 层，不入库。
 * 这样改文案不需要迁移数据。
 */
export const PURCHASE_ITEM_CATEGORIES = [
  'light_energy',
  'injection',
  'chemical_peel',
  'mesotherapy',
  'cleansing',
  'surgery',
  'other',
] as const;

/** 核销状态（PRD 第 7.1 节）。界面使用「撤销核销」等产品语言，不暴露这两个值。 */
export const REDEMPTION_STATUSES = ['active', 'void'] as const;
