/**
 * 项目目录的完整性检查。开发环境加载目录时执行（见 `./index.ts`），返回问题列表，空列表表示通过。
 *
 * 目录随 App 打包，线上没有修正入口，数据错误必须在开发期就暴露出来。
 */

import { SERVICE_CATEGORY_CODES } from './categories';
import { normalizeServiceName, serviceMigrationKeys } from './helpers';
import type { LegacyCrossCategoryMapping, ServiceBasis, ServiceCategoryEntry, ServiceEntry } from './types';

/** 小写 ASCII snake_case：字母开头，单词之间单个下划线 */
const SERVICE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SERVICE_CODE_MAX_LENGTH = 48;

const STATUSES: readonly string[] = ['active', 'deprecated'];
const BASES: readonly string[] = ['official_category', 'professional_consensus', 'market_common'];

/**
 * 代码中不允许出现的单词（按下划线切分后逐个比较，不做子串匹配，避免误伤 `picosecond` 一类的词）。
 * 这只是防手误的拦截表，不是品牌名录。
 *
 * 部位词**不在**这里：术式本身固有的部位（眼睑、鼻、乳房、毛发）可以出现在代码中；
 * 禁止的是把同一种通用技术按治疗部位拆成多个代码，由 `BODY_PART_CODE_TOKENS` 单独检查。
 */
export const FORBIDDEN_CODE_TOKENS: readonly string[] = [
  // 品牌与厂商
  'thermage', 'ultherapy', 'ulthera', 'fotona', 'hydrafacial', 'botox', 'dysport', 'juvederm', 'restylane',
  'sculptra', 'radiesse', 'ellanse', 'coolsculpting', 'emsculpt', 'lumenis', 'solta', 'merz', 'allergan',
  'galderma', 'cutera', 'candela', 'cynosure', 'm22',
  // 机构
  'clinic', 'hospital', 'institution',
  // 营销代际
  'gen', 'generation', 'new', 'pro', 'plus', 'max', 'ultra',
  // 功效
  'whitening', 'brightening', 'slimming', 'antiaging', 'rejuvenation', 'best', 'miracle',
  // 用户信息
  'user', 'customer', 'vip',
];
const YEAR_TOKEN_PATTERN = /^(?:19|20)\d{2}$/;

/**
 * 治疗部位词。代码去掉这些词之后如果与另一个代码相同，说明同一种通用技术被按部位拆开了，
 * 例如 `face_light_hair_removal` 与 `leg_light_hair_removal`。部位固有的术式（`double_eyelid_surgery` 与
 * `lower_eyelid_bag_surgery`、`rhinoplasty`）去掉部位词后仍然唯一，不受影响。
 */
export const BODY_PART_CODE_TOKENS: readonly string[] = [
  'face', 'facial', 'neck', 'eye', 'eyes', 'eyelid', 'nose', 'nasal', 'lip', 'lips', 'chin', 'jaw', 'cheek',
  'breast', 'body', 'abdomen', 'arm', 'arms', 'leg', 'legs', 'forehead', 'hand', 'hands', 'back', 'underarm',
  'axilla', 'scalp', 'thigh', 'buttock',
];

/**
 * 不得作为 `displayName` 或 `legacyExactNames` 参与自动迁移的名称（按比较键**完全相等**检查）：
 * 分类级用词，以及产品确认有歧义、不应自动归类的叫法。它们可以作搜索别名（下一张表的除外）。
 */
export const FORBIDDEN_MIGRATION_NAMES: readonly string[] = [
  '隆鼻', '皮肤激光', '点阵激光', '刷酸', 'Fotona 4D', '无针水光', '酶焕肤', '眼睑成形术',
  '注射', '激光', '清洁', '微针', '手术',
];

/**
 * 产品确认暂不标准化的项目：没有代码，也不得作为任何条目的名称、别名或旧名称（按比较键**完全相等**检查），
 * 用户记录时只能保存为自定义名称。搜索仍可能因包含关系列出候选（如「隆鼻」列出含「隆鼻手术」的条目），
 * 但永远不会自动选中。
 */
export const UNSTANDARDIZED_NAMES: readonly string[] = [
  'Fotona 4D', '无针水光', '酶焕肤', '皮肤激光', '点阵激光', '刷酸', '隆鼻',
];

/**
 * 不得出现在 `displayName` 中的品牌名（按比较键做包含检查）。
 * 品牌名可以进 `aliases`；经产品审核的也可以进 `legacyExactNames`。同样只是防手误的拦截表。
 */
export const BRAND_TERMS: readonly string[] = [
  '热玛吉', 'thermage', '超声炮', 'ultherapy', 'ulthera', '海菲秀', 'hydrafacial', '超光子', 'fotona', '欧洲之星',
  '保妥适', 'botox', '乔雅登', 'juvederm', '瑞蓝', 'restylane', '衡力', '嗨体', '艾维岚', 'sculptra', '热拉提',
];

function isCleanText(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim();
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function containsBrand(text: string): string | null {
  const key = normalizeServiceName(text);
  return BRAND_TERMS.find((brand) => key.includes(normalizeServiceName(brand))) ?? null;
}

export type ServiceCatalogCounts = {
  readonly categories: number;
  readonly services: number;
  readonly activeServices: number;
  readonly deprecatedServices: number;
  readonly legacyCrossCategoryMappings: number;
  readonly basis: Readonly<Record<ServiceBasis, number>>;
};

export function validateServiceCatalog(
  categories: readonly ServiceCategoryEntry[],
  services: readonly ServiceEntry[],
  crossCategoryMappings: readonly LegacyCrossCategoryMapping[],
  expectedCounts?: ServiceCatalogCounts,
): string[] {
  const problems: string[] = [];

  // ── 一级分类：七个冻结代码，不增不减 ──
  const categoryCodes = categories.map((category) => category.code as string);
  for (const code of findDuplicates(categoryCodes)) {
    problems.push(`一级分类代码重复：${code}`);
  }
  const frozenCodes = [...SERVICE_CATEGORY_CODES].sort().join(',');
  if ([...new Set(categoryCodes)].sort().join(',') !== frozenCodes || categories.length !== SERVICE_CATEGORY_CODES.length) {
    problems.push(`一级分类必须恰好是冻结的七个：${SERVICE_CATEGORY_CODES.join('、')}`);
  }
  for (const sortOrder of findDuplicates(categories.map((category) => String(category.sortOrder)))) {
    problems.push(`一级分类排序值重复：${sortOrder}`);
  }
  const categoryByCode = new Map(categories.map((category) => [category.code as string, category]));
  const categoryRank = new Map(
    [...categories].sort((left, right) => left.sortOrder - right.sortOrder).map((category, index) => [category.code as string, index]),
  );
  for (const category of categories) {
    if (!isCleanText(category.displayName)) {
      problems.push(`一级分类名称为空或带首尾空格：${category.code}`);
    }
    const hasServices = services.some((entry) => entry.categoryCode === category.code);
    if (category.hasCatalogServices !== hasServices) {
      problems.push(`一级分类「${category.code}」的 hasCatalogServices 与实际条目不一致`);
    }
  }
  if (
    categoryByCode.get('other')?.hasCatalogServices !== false ||
    services.some((entry) => entry.categoryCode === 'other')
  ) {
    problems.push('「其他」分类不能有目录条目，未收录的项目一律走自定义名称');
  }

  // ── 二级条目：逐条检查 ──
  for (const code of findDuplicates(services.map((entry) => entry.code))) {
    problems.push(`项目代码重复：${code}`);
  }

  for (const entry of services) {
    const label = typeof entry.code === 'string' ? entry.code : String(entry.code);
    // 正则会把非字符串悄悄转成字符串再匹配，所以先单独确认类型。
    if (typeof entry.code !== 'string' || !SERVICE_CODE_PATTERN.test(entry.code)) {
      problems.push(`项目代码不是小写 ASCII snake_case：${label}`);
    } else {
      if (entry.code.length > SERVICE_CODE_MAX_LENGTH) {
        problems.push(`项目代码超过 ${SERVICE_CODE_MAX_LENGTH} 个字符：${label}`);
      }
      for (const token of entry.code.split('_')) {
        if (FORBIDDEN_CODE_TOKENS.includes(token)) {
          problems.push(`项目代码含品牌、机构、营销代际、功效或用户信息词「${token}」：${label}`);
        }
        if (YEAR_TOKEN_PATTERN.test(token)) {
          problems.push(`项目代码含年份：${label}`);
        }
      }
    }
    if (!categoryByCode.has(entry.categoryCode)) {
      problems.push(`项目所属分类不存在：${label} → ${String(entry.categoryCode)}`);
    }
    if (!STATUSES.includes(entry.status)) {
      problems.push(`项目状态不合法：${label} → ${String(entry.status)}`);
    }
    if (!BASES.includes(entry.basis)) {
      problems.push(`项目收录依据不合法：${label} → ${String(entry.basis)}`);
    }
    if (!Number.isInteger(entry.sortOrder) || entry.sortOrder <= 0) {
      problems.push(`项目排序值必须是正整数：${label}`);
    }
    if (!isCleanText(entry.displayName)) {
      problems.push(`项目名称为空或带首尾空格：${label}`);
    } else if (containsBrand(entry.displayName) !== null) {
      problems.push(`项目名称不能含品牌名「${containsBrand(entry.displayName)}」：${label}`);
    }
    if (entry.note !== null && !isCleanText(entry.note)) {
      problems.push(`项目说明必须为 null 或非空文字：${label}`);
    }
    if (!Array.isArray(entry.aliases) || !entry.aliases.every(isCleanText)) {
      problems.push(`项目别名必须是非空、无首尾空格的文字：${label}`);
    }
    if (!Array.isArray(entry.legacyExactNames) || !entry.legacyExactNames.every(isCleanText)) {
      problems.push(`项目旧名称必须是非空、无首尾空格的文字：${label}`);
      continue;
    }
    const searchable = new Set(
      [entry.displayName, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
        .filter(isCleanText)
        .map(normalizeServiceName),
    );
    for (const name of entry.legacyExactNames) {
      if (!searchable.has(normalizeServiceName(name))) {
        problems.push(`旧名称必须同时是该条目的名称或别名：${label} → ${name}`);
      }
    }
  }

  // ── 排列：按分类顺序分组，分类内 sortOrder 严格升序 ──
  for (let index = 1; index < services.length; index += 1) {
    const previous = services[index - 1];
    const current = services[index];
    const previousRank = categoryRank.get(previous.categoryCode) ?? -1;
    const currentRank = categoryRank.get(current.categoryCode) ?? -1;
    if (currentRank < previousRank || (currentRank === previousRank && current.sortOrder <= previous.sortOrder)) {
      problems.push(`项目没有按分类顺序与 sortOrder 严格升序排列：${previous.code} → ${current.code}`);
    }
  }

  // ── 通用技术不按部位拆分：去掉部位词后代码不得重复 ──
  const techniqueOwner = new Map<string, string>();
  for (const entry of services) {
    if (typeof entry.code !== 'string') {
      continue;
    }
    const technique = entry.code
      .split('_')
      .filter((token) => !BODY_PART_CODE_TOKENS.includes(token))
      .join('_');
    const owner = techniqueOwner.get(technique);
    if (owner !== undefined) {
      problems.push(`通用技术被按部位拆成多个代码：${owner} 与 ${entry.code}`);
    } else {
      techniqueOwner.set(technique, entry.code);
    }
  }

  // ── 迁移比较键（displayName 与 legacyExactNames）：不含禁用名称，全局只属于一个条目 ──
  const forbiddenMigrationKeys = new Set(FORBIDDEN_MIGRATION_NAMES.map(normalizeServiceName));
  const unstandardizedKeys = new Set(UNSTANDARDIZED_NAMES.map(normalizeServiceName));
  const migrationOwner = new Map<string, string>();
  for (const entry of services) {
    if (!isCleanText(entry.displayName) || !Array.isArray(entry.legacyExactNames) || !entry.legacyExactNames.every(isCleanText)) {
      continue;
    }
    for (const key of serviceMigrationKeys(entry)) {
      if (forbiddenMigrationKeys.has(key)) {
        problems.push(`「${key}」不得作为名称或旧名称参与自动迁移：${entry.code}`);
      }
      const owner = migrationOwner.get(key);
      if (owner !== undefined) {
        problems.push(`迁移名称归一化后冲突：「${key}」同时属于 ${owner} 与 ${entry.code}`);
      } else {
        migrationOwner.set(key, entry.code);
      }
    }
    for (const alias of Array.isArray(entry.aliases) ? entry.aliases.filter(isCleanText) : []) {
      if (unstandardizedKeys.has(normalizeServiceName(alias))) {
        problems.push(`暂不标准化的项目不得作为别名：${entry.code} → ${alias}`);
      }
    }
  }

  // ── 全局唯一：名称与别名的比较键不得冲突；旧名称的比较键全局唯一 ──
  const searchOwner = new Map<string, string>();
  const legacyOwner = new Map<string, string>();
  for (const entry of services) {
    const names = [entry.displayName, ...(Array.isArray(entry.aliases) ? entry.aliases : [])].filter(isCleanText);
    for (const name of names) {
      const key = normalizeServiceName(name);
      const owner = searchOwner.get(key);
      if (owner !== undefined) {
        problems.push(`名称或别名归一化后冲突：「${name}」同时属于 ${owner} 与 ${entry.code}`);
      } else {
        searchOwner.set(key, entry.code);
      }
    }
    for (const name of Array.isArray(entry.legacyExactNames) ? entry.legacyExactNames.filter(isCleanText) : []) {
      const key = normalizeServiceName(name);
      const owner = legacyOwner.get(key);
      if (owner !== undefined) {
        problems.push(`旧名称归一化后冲突：「${name}」同时属于 ${owner} 与 ${entry.code}`);
      } else {
        legacyOwner.set(key, entry.code);
      }
    }
  }

  // ── 跨分类白名单：只放开分类，不扩大名称 ──
  const serviceByCode = new Map(services.map((entry) => [entry.code, entry]));
  const crossCategoryKeys = new Set<string>();
  for (const mapping of crossCategoryMappings) {
    const label = `${String(mapping.sourceCategoryCode)} + ${String(mapping.legacyName)}`;
    if (!categoryByCode.has(mapping.sourceCategoryCode)) {
      problems.push(`跨分类白名单的旧分类不存在：${label}`);
    }
    if (mapping.sourceCategoryCode === 'other') {
      problems.push(`跨分类白名单不能从「其他」分类迁出：${label}`);
    }
    if (!isCleanText(mapping.note)) {
      problems.push(`跨分类白名单必须写明理由：${label}`);
    }
    if (!isCleanText(mapping.legacyName)) {
      problems.push(`跨分类白名单的旧名称为空或带首尾空格：${label}`);
      continue;
    }
    const key = normalizeServiceName(mapping.legacyName);
    if (forbiddenMigrationKeys.has(key) || unstandardizedKeys.has(key)) {
      problems.push(`「${key}」不得出现在跨分类白名单中：${label}`);
    }
    const lookupKey = `${mapping.sourceCategoryCode}\u0000${key}`;
    if (crossCategoryKeys.has(lookupKey)) {
      problems.push(`跨分类白名单的「旧分类 + 旧名称」重复：${label}`);
    }
    crossCategoryKeys.add(lookupKey);
    const target = serviceByCode.get(mapping.targetServiceCode);
    if (target === undefined) {
      problems.push(`跨分类白名单的目标条目不存在：${label} → ${String(mapping.targetServiceCode)}`);
      continue;
    }
    if (target.status !== 'active') {
      problems.push(`跨分类白名单的目标条目已停用：${label} → ${target.code}`);
    }
    if (target.categoryCode === mapping.sourceCategoryCode) {
      problems.push(`跨分类白名单的目标与旧分类相同，不需要例外：${label} → ${target.code}`);
    }
    if (!serviceMigrationKeys(target).includes(key)) {
      problems.push(`跨分类白名单的旧名称必须是目标条目的名称或旧名称：${label} → ${target.code}`);
    }
  }

  if (expectedCounts !== undefined) {
    const active = services.filter((entry) => entry.status === 'active').length;
    const deprecated = services.filter((entry) => entry.status === 'deprecated').length;
    if (categories.length !== expectedCounts.categories) {
      problems.push(`一级分类数 ${categories.length} 与来源说明 ${expectedCounts.categories} 不一致`);
    }
    if (services.length !== expectedCounts.services) {
      problems.push(`项目条目数 ${services.length} 与来源说明 ${expectedCounts.services} 不一致`);
    }
    if (active !== expectedCounts.activeServices) {
      problems.push(`在用条目数 ${active} 与来源说明 ${expectedCounts.activeServices} 不一致`);
    }
    if (deprecated !== expectedCounts.deprecatedServices) {
      problems.push(`已停用条目数 ${deprecated} 与来源说明 ${expectedCounts.deprecatedServices} 不一致`);
    }
    if (crossCategoryMappings.length !== expectedCounts.legacyCrossCategoryMappings) {
      problems.push(
        `跨分类白名单条数 ${crossCategoryMappings.length} 与来源说明 ${expectedCounts.legacyCrossCategoryMappings} 不一致`,
      );
    }
    for (const basis of BASES) {
      const actual = services.filter((entry) => entry.basis === basis).length;
      const expected = expectedCounts.basis[basis as ServiceBasis];
      if (actual !== expected) {
        problems.push(`收录依据 ${basis} 的条目数 ${actual} 与来源说明 ${expected} 不一致`);
      }
    }
  }

  return problems;
}
