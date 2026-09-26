/**
 * 项目两级目录与选择结果的类型（DATA_MODEL_V4 第 8.2、8.3 节）。
 *
 * 业务上一律用代码标识条目，不用数组下标，也不用中文名称：名称可以改，代码永不改义、永不复用。
 */

/**
 * 一级分类代码。七个取值与 v3 的套餐项目分类完全相同，**原样冻结**：
 * 不增、不删、不合并、不改义（DATA_MODEL_V4 第 8.2 节）。
 */
export type ServiceCategoryCode =
  | 'light_energy'
  | 'injection'
  | 'chemical_peel'
  | 'mesotherapy'
  | 'cleansing'
  | 'surgery'
  | 'other';

export type ServiceCategoryEntry = {
  readonly code: ServiceCategoryCode;
  readonly displayName: string;
  /** 升序排列，决定分类在选择器中的顺序 */
  readonly sortOrder: number;
  /**
   * 这个分类下是否有目录项目。「其他」固定为 false：它没有「其他项目」一类的兜底代码，
   * 目录里找不到的项目一律走自定义名称。
   */
  readonly hasCatalogServices: boolean;
};

/** 条目状态：在用 / 已停用。已停用的条目仍能按代码查到（用于显示历史），但不再出现在新建选择与搜索中。 */
export type ServiceStatus = 'active' | 'deprecated';

/**
 * 条目收录依据。只说明「为什么收这一条」，不是医疗、资质或效果背书。
 *
 * - `official_category`：该具体项目或可直接对应的术式在国家卫生健康委《医疗美容项目分级管理目录》中有明确依据。
 *   官方目录只列出上位技术类别（如激光、射频、超声、微针）时，下位项目**不**归入这一类。
 * - `professional_consensus`：具体技术划分主要来自监管机构、医学专业学会或技术资料。
 * - `market_common`：为满足用户记录而建立的稳定市场项目概念（不是品牌）。
 */
export type ServiceBasis = 'official_category' | 'professional_consensus' | 'market_common';

export type ServiceEntry = {
  /**
   * 稳定的小写 ASCII snake_case 代码，全局唯一，永不复用；不含品牌、机构、年份、营销代际、功效或用户信息。
   * 部位只在术式本身固有时出现（如眼睑、鼻、乳房），通用技术不按治疗部位拆成多个代码。
   */
  readonly code: string;
  readonly categoryCode: ServiceCategoryCode;
  /** 通用名称，不含品牌 */
  readonly displayName: string;
  /**
   * 搜索与展示用的其他叫法，可以含市场叫法与品牌名。**只用于本地搜索**，从不参与旧数据迁移：
   * 增删别名不会改变任何迁移结果。同一个名称可以同时出现在这里和 `legacyExactNames` 中。
   */
  readonly aliases: readonly string[];
  readonly status: ServiceStatus;
  /** 同一分类内升序排列 */
  readonly sortOrder: number;
  readonly basis: ServiceBasis;
  /**
   * 经产品审核并冻结的旧名称。v3 → v4 迁移**只**认 `displayName` 与这里的名称：旧项目名称经
   * `normalizeServiceName` 后与其中一个完全相等、在整个目录中唯一命中、目标在用且与旧记录同一分类，
   * 才写入本条代码。可以含经审核的品牌名或市场叫法；不收分类级用词与有歧义的叫法。
   * 跨分类只允许 `LegacyCrossCategoryMapping` 白名单里的明确例外。
   */
  readonly legacyExactNames: readonly string[];
  /** 给内容审核看的说明，不在界面上展示 */
  readonly note: string | null;
};

/**
 * v3 → v4 一次性迁移的跨一级分类例外（`./legacy-cross-category.ts`）。
 *
 * 旧分类为 `sourceCategoryCode`、旧名称归一化后**完全等于** `legacyName` 的记录，
 * 在同分类精确匹配落空之后，写入 `targetServiceCode`。只用于旧数据迁移：
 * 备份 v1 → v2 转换复用同一函数；不用于新建、编辑、搜索、用户重新选择与 v2 备份的恢复。
 */
export type LegacyCrossCategoryMapping = {
  readonly sourceCategoryCode: ServiceCategoryCode;
  /** 旧名称原文；必须同时是目标条目的 `displayName` 或 `legacyExactNames` 之一 */
  readonly legacyName: string;
  readonly targetServiceCode: string;
  /** 为什么允许这条例外，给审核看 */
  readonly note: string;
};

/**
 * 项目选择的结果。两种形态互斥：要么是目录项目，要么是自定义名称，**不存在两者都有的状态**。
 * 「没有选择」用 `null` 表示，不是这里的第三种取值。
 *
 * - 目录项目：`serviceCode` 来自目录且属于 `categoryCode`，`customName` 为 null。
 * - 自定义：`serviceCode` 为 null，`customName` 是清洗后的用户文字（去首尾空格、折叠连续空白），不为空。
 */
export type ServiceSelection =
  | {
      readonly categoryCode: ServiceCategoryCode;
      readonly serviceCode: string;
      readonly customName: null;
    }
  | {
      readonly categoryCode: ServiceCategoryCode;
      readonly serviceCode: null;
      readonly customName: string;
    };

/** 本地搜索的一条结果。命中别名时仍返回目录条目本身（规范代码），`matchedAlias` 记录命中的那个别名。 */
export type ServiceSearchResult = {
  readonly entry: ServiceEntry;
  readonly matchedAlias: string | null;
};
