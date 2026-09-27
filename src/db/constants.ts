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

/**
 * 默认档案下「自己」的固定 ID（DATA_MODEL_V4 第 4.2 节）。
 *
 * 只在**创建**「自己」时使用：v4 迁移、新装数据库与备份 v1 → v2 转换共用同一条规则，
 * 同一份旧数据两条路径得到同一个 ID。**查找**「自己」一律用 `(profile_id, is_self = 1)`，
 * 不得用这个常量：从 v2 备份恢复后，「自己」的 ID 是备份里的那个。
 */
export const SELF_PERSON_ID = '00000000-0000-4000-8000-000000000002';

/** 「自己」的显示名称，v4 范围内不可改名（PRD 第 5B.4 节）。 */
export const SELF_PERSON_DISPLAY_NAME = '自己';

/** 购买类型：套餐 / 单次购买（DATA_MODEL_V4 第 4.3、7 节）。 */
export const PURCHASE_KINDS = ['package', 'single'] as const;

/** 人员状态：使用中 / 已归档。「自己」只能是使用中。 */
export const PERSON_STATUSES = ['active', 'archived'] as const;

/** 使用记录状态，取值与旧核销状态相同，界面同样不暴露。 */
export const USAGE_STATUSES = ['active', 'void'] as const;

/**
 * 使用记录来源（DATA_MODEL_V4 第 5.1 节），v4 一次冻结全部五个取值。
 * `deleted_package` 只能由删除套餐产生。界面不出现这些技术取值。
 */
export const USAGE_SOURCE_KINDS = [
  'package_item',
  'single_purchase',
  'external',
  'unlinked',
  'deleted_package',
] as const;
