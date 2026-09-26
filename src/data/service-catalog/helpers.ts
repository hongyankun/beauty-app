/**
 * 项目目录的查询、选择结果构造与校验。全部是纯函数，不依赖 React Native、数据库或网络，
 * 也不修改目录：返回的列表都是冻结数组，调用方不能在上面 sort 或 push。
 *
 * 查询由 `createServiceCatalogQueries` 基于一份目录数据构造；模块同时导出一套绑定到当前目录的函数，
 * 业务代码直接用那一套。工厂只是为了让验证脚本能用含停用条目的测试目录跑同一份逻辑。
 */

import { SERVICE_CATEGORIES } from './categories';
import { LEGACY_CROSS_CATEGORY_MAPPINGS } from './legacy-cross-category';
import { SERVICES } from './services';
import type {
  LegacyCrossCategoryMapping,
  ServiceCategoryCode,
  ServiceCategoryEntry,
  ServiceEntry,
  ServiceSearchResult,
  ServiceSelection,
} from './types';

/**
 * 清洗用户填写的项目名称：去除首尾空格，把连续空白（含全角空格）折叠成一个半角空格。
 * 不改大小写，不删标点，不补字——存下来的就是用户写的样子。
 */
export function cleanServiceName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * 项目名称的比较键：清洗后转小写（只影响拉丁字母，「CO2」「4D」「IPL」「TCA」里的数字和字母都保留）。
 * 不删标点，不做全半角转换、拼音、错别字或包含匹配：两个名称只有比较键完全相等才算同一个。
 *
 * 规则与机构名称判重（`src/utils/institution-name.ts`）相同，这里是一份中立的独立实现，
 * 避免项目目录依赖机构模块；将来统一成一个共享的名称归一化函数时两处一起替换。
 */
export function normalizeServiceName(raw: string): string {
  return cleanServiceName(raw).toLowerCase();
}

const SELECTION_KEYS = ['categoryCode', 'customName', 'serviceCode'] as const;

function hasExactlySelectionKeys(value: object): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === SELECTION_KEYS.length && keys.every((key, index) => key === SELECTION_KEYS[index]);
}

const NO_SERVICES: readonly ServiceEntry[] = Object.freeze([]);
const NO_RESULTS: readonly ServiceSearchResult[] = Object.freeze([]);

/** 分类不认识时的展示名称（DATA_MODEL_V4 第 8.3 节） */
export const UNKNOWN_CATEGORY_DISPLAY_NAME = '其他';

/** 迁移索引的一行：比较键、条目代码、条目分类、条目状态。 */
export type ServiceMigrationKey = readonly [key: string, code: string, categoryCode: string, status: string];

/** 一个条目参与自动迁移的比较键：`displayName` 与 `legacyExactNames`，**不含 `aliases`**，同条目内去重。 */
export function serviceMigrationKeys(entry: ServiceEntry): readonly string[] {
  return [...new Set([entry.displayName, ...entry.legacyExactNames].map(normalizeServiceName))];
}

/**
 * 迁移索引：全部条目（含已停用）的迁移比较键，按比较键、再按代码排序。
 * 只由 `displayName` 与 `legacyExactNames` 生成，增删别名不会改变它。
 */
export function buildServiceMigrationIndex(services: readonly ServiceEntry[]): readonly ServiceMigrationKey[] {
  const rows: ServiceMigrationKey[] = [];
  for (const entry of services) {
    for (const key of serviceMigrationKeys(entry)) {
      rows.push(Object.freeze([key, entry.code, entry.categoryCode, entry.status] as const));
    }
  }
  rows.sort((left, right) =>
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0,
  );
  return Object.freeze(rows);
}

/**
 * 32 位 FNV-1a（按 UTF-16 码元），输出 8 位小写十六进制。
 * 只用于在审核与测试中确认「迁移结果有没有变」，不是安全用途的哈希。
 */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 迁移索引的稳定摘要：对索引的 JSON 序列化做 FNV-1a。 */
export function serviceMigrationDigest(services: readonly ServiceEntry[]): string {
  return fnv1a32(JSON.stringify(buildServiceMigrationIndex(services)));
}

/** 跨分类白名单索引的一行：旧分类、归一化旧名称、目标代码。 */
export type LegacyCrossCategoryKey = readonly [sourceCategoryCode: string, key: string, targetServiceCode: string];

function crossCategoryLookupKey(sourceCategoryCode: string, key: string): string {
  return `${sourceCategoryCode}\u0000${key}`;
}

/** 跨分类白名单索引：按旧分类、再按归一化旧名称排序。只由白名单生成，与目录别名无关。 */
export function buildLegacyCrossCategoryIndex(
  mappings: readonly LegacyCrossCategoryMapping[],
): readonly LegacyCrossCategoryKey[] {
  const rows = mappings.map((mapping) =>
    Object.freeze([mapping.sourceCategoryCode, normalizeServiceName(mapping.legacyName), mapping.targetServiceCode] as const),
  );
  rows.sort((left, right) =>
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0,
  );
  return Object.freeze(rows);
}

/** 跨分类白名单的稳定摘要，与普通迁移摘要分开，便于单独审核。 */
export function legacyCrossCategoryDigest(mappings: readonly LegacyCrossCategoryMapping[]): string {
  return fnv1a32(JSON.stringify(buildLegacyCrossCategoryIndex(mappings)));
}

export function createServiceCatalogQueries(
  categories: readonly ServiceCategoryEntry[],
  services: readonly ServiceEntry[],
  crossCategoryMappings: readonly LegacyCrossCategoryMapping[],
) {
  const categoryByCode: ReadonlyMap<string, ServiceCategoryEntry> = new Map(
    categories.map((category) => [category.code, category]),
  );
  const serviceByCode: ReadonlyMap<string, ServiceEntry> = new Map(services.map((entry) => [entry.code, entry]));

  const sortedCategories: readonly ServiceCategoryEntry[] = Object.freeze(
    [...categories].sort((left, right) => left.sortOrder - right.sortOrder),
  );
  const categoryRank: ReadonlyMap<string, number> = new Map(
    sortedCategories.map((category, index) => [category.code, index]),
  );
  // 搜索与列表的稳定顺序：分类顺序在前，分类内按 sortOrder，再按代码兜底。
  const orderedServices: readonly ServiceEntry[] = Object.freeze(
    [...services].sort(
      (left, right) =>
        (categoryRank.get(left.categoryCode) ?? Number.MAX_SAFE_INTEGER) -
          (categoryRank.get(right.categoryCode) ?? Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder ||
        (left.code < right.code ? -1 : left.code > right.code ? 1 : 0),
    ),
  );
  const activeByCategory: ReadonlyMap<string, readonly ServiceEntry[]> = new Map(
    sortedCategories.map((category) => [
      category.code,
      Object.freeze(
        orderedServices.filter((entry) => entry.categoryCode === category.code && entry.status === 'active'),
      ),
    ]),
  );
  const deprecatedServices: readonly ServiceEntry[] = Object.freeze(
    orderedServices.filter((entry) => entry.status === 'deprecated'),
  );
  // 迁移比较键 → 拥有它的条目（含已停用）。完整性检查保证每个键只属于一个条目，这里仍按「命中几条」判断。
  const migrationOwners: ReadonlyMap<string, readonly ServiceEntry[]> = (() => {
    const owners = new Map<string, ServiceEntry[]>();
    for (const entry of services) {
      for (const key of serviceMigrationKeys(entry)) {
        owners.set(key, [...(owners.get(key) ?? []), entry]);
      }
    }
    return owners;
  })();
  // 「旧分类 + 归一化旧名称」→ 目标代码。完整性检查保证键唯一；重复时两条都不采用。
  const crossCategoryTargets: ReadonlyMap<string, string | null> = (() => {
    const targets = new Map<string, string | null>();
    for (const mapping of crossCategoryMappings) {
      const lookupKey = crossCategoryLookupKey(mapping.sourceCategoryCode, normalizeServiceName(mapping.legacyName));
      targets.set(lookupKey, targets.has(lookupKey) ? null : mapping.targetServiceCode);
    }
    return targets;
  })();
  // 每个在用条目的搜索键：展示名称与别名的比较键，别名保留原文用于回报命中了哪个。
  const searchKeys = orderedServices
    .filter((entry) => entry.status === 'active')
    .map((entry) => ({
      entry,
      displayKey: normalizeServiceName(entry.displayName),
      aliasKeys: entry.aliases.map((alias) => ({ alias, key: normalizeServiceName(alias) })),
    }));

  /** 全部一级分类，按 `sortOrder` 升序。 */
  function listServiceCategories(): readonly ServiceCategoryEntry[] {
    return sortedCategories;
  }

  /** 某个分类下可供新建选择的在用条目，按 `sortOrder` 升序；「其他」与未知分类为空列表。 */
  function listActiveServices(categoryCode: string): readonly ServiceEntry[] {
    return activeByCategory.get(categoryCode) ?? NO_SERVICES;
  }

  /** 按代码查找，**含已停用条目**（用于显示历史）。找不到时为 null，调用方回退到名称快照。 */
  function findServiceByCode(code: string): ServiceEntry | null {
    return serviceByCode.get(code) ?? null;
  }

  /** 全部已停用条目。它们不出现在新建选择与搜索中，但历史记录仍能按代码显示。 */
  function listDeprecatedServices(): readonly ServiceEntry[] {
    return deprecatedServices;
  }

  function isServiceCategoryCode(value: unknown): value is ServiceCategoryCode {
    return typeof value === 'string' && categoryByCode.has(value);
  }

  /** 代码是否存在于目录（含已停用）。 */
  function isKnownServiceCode(value: unknown): boolean {
    return typeof value === 'string' && serviceByCode.has(value);
  }

  /** 代码是否存在且属于这个分类（含已停用）。 */
  function isServiceInCategory(serviceCode: unknown, categoryCode: unknown): boolean {
    if (typeof serviceCode !== 'string') {
      return false;
    }
    const entry = serviceByCode.get(serviceCode);
    return entry !== undefined && entry.categoryCode === categoryCode;
  }

  /** 分类的中文名称；代码不认识时显示「其他」，不改写数据（DATA_MODEL_V4 第 8.3 节）。 */
  function getServiceCategoryDisplayName(categoryCode: string): string {
    return categoryByCode.get(categoryCode)?.displayName ?? UNKNOWN_CATEGORY_DISPLAY_NAME;
  }

  /** 目录项目的选择结果。代码不存在、已停用或不属于该分类时为 null。 */
  function standardServiceSelection(categoryCode: string, serviceCode: string): ServiceSelection | null {
    const entry = serviceByCode.get(serviceCode);
    if (entry === undefined || entry.status !== 'active' || entry.categoryCode !== categoryCode) {
      return null;
    }
    return { categoryCode: entry.categoryCode, serviceCode: entry.code, customName: null };
  }

  /**
   * 自定义项目的选择结果，名称按 `cleanServiceName` 清洗。分类不存在或名称为空时为 null。
   * 即使名称与某个目录条目相同也**不**换成目录代码：自定义项目永不自动归并（DATA_MODEL_V4 第 8.2 节）。
   */
  function customServiceSelection(categoryCode: string, rawName: string): ServiceSelection | null {
    const category = categoryByCode.get(categoryCode);
    const customName = cleanServiceName(rawName);
    if (category === undefined || customName === '') {
      return null;
    }
    return { categoryCode: category.code, serviceCode: null, customName };
  }

  /**
   * 运行时校验一个**新选择**的项目结果：参数是 `unknown`，可以直接喂表单状态或路由参数。
   * 类型检查挡不住手写的伪造对象，写入之前（BT-0021B / BT-0023 的服务层）必须再调用一次。
   *
   * - 字段恰好是 `categoryCode`、`serviceCode`、`customName` 三个，不多不少。
   * - 分类必须是七个一级分类之一。
   * - 目录项目：代码存在、**在用**、属于该分类，`customName` 为 null。
   * - 自定义：`serviceCode` 为 null，`customName` 是清洗后的非空文字。
   * - 两者都有或都没有都不通过。
   *
   * **只用于**：从选择器新选出的项目；用户主动修改项目后、写入之前的校验。
   *
   * **不用于**：显示或加载数据库里已有的记录与快照；备份的结构校验；从备份恢复；因目录更新批量改写数据。
   * 目录停用、改名，或旧版本 App 存下了当前目录不认识的代码时，已有数据照常按保存时的名称快照显示，
   * 不因此删除、清空、拒绝加载或自动改写；只有用户主动重新选择时才写入当前目录的代码。
   */
  function isValidNewServiceSelection(value: unknown): value is ServiceSelection {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !hasExactlySelectionKeys(value)) {
      return false;
    }
    const candidate = value as Record<(typeof SELECTION_KEYS)[number], unknown>;
    if (!isServiceCategoryCode(candidate.categoryCode)) {
      return false;
    }
    if (candidate.serviceCode === null) {
      return (
        typeof candidate.customName === 'string' &&
        candidate.customName !== '' &&
        candidate.customName === cleanServiceName(candidate.customName)
      );
    }
    if (typeof candidate.serviceCode !== 'string' || candidate.customName !== null) {
      return false;
    }
    const entry = serviceByCode.get(candidate.serviceCode);
    return entry !== undefined && entry.status === 'active' && entry.categoryCode === candidate.categoryCode;
  }

  /**
   * 选择结果的展示名称：目录项目取目录**当前**名称（已停用的也照常显示），自定义项目取用户文字。
   * 目录不认识这个代码时为 null，调用方改用保存时的名称快照（DATA_MODEL_V4 第 8.3 节）。
   */
  function getServiceSelectionDisplayName(selection: ServiceSelection): string | null {
    if (selection.serviceCode === null) {
      return selection.customName;
    }
    return serviceByCode.get(selection.serviceCode)?.displayName ?? null;
  }

  /**
   * v3 → v4 迁移用的旧名称映射，只用于这一次性迁移与复用同一函数的备份 v1 → v2 转换；
   * v2 备份的恢复不调用它，也不据此重校验历史快照。按顺序尝试，命中即停，都落空时为 null
   * （旧名称作为自定义名称保留，不再做任何推断）：
   *
   * 1. 同分类精确匹配：旧名称经 `normalizeServiceName` 后**完全等于**某条目的 `displayName` 或
   *    `legacyExactNames` 之一，这个比较键在**整个目录**（含已停用条目）中只属于一个条目，
   *    该条目在用且与旧记录属于同一分类；
   * 2. 跨分类白名单：「旧分类 + 归一化旧名称」恰好是白名单里的一条，目标存在、在用且分类与旧分类不同
   *    （DATA_MODEL_V4 第 10.4 节）。
   *
   * **不看 `aliases`**，不做包含、拼音、错别字、相似度或任何模糊匹配。
   */
  function matchLegacyServiceName(categoryCode: string, rawName: string): ServiceEntry | null {
    const key = normalizeServiceName(rawName);
    if (key === '') {
      return null;
    }
    const owners = migrationOwners.get(key) ?? NO_SERVICES;
    if (owners.length === 1) {
      const [entry] = owners;
      if (entry.status === 'active' && entry.categoryCode === categoryCode) {
        return entry;
      }
    }
    const targetCode = crossCategoryTargets.get(crossCategoryLookupKey(categoryCode, key));
    if (targetCode === undefined || targetCode === null) {
      return null;
    }
    const target = serviceByCode.get(targetCode);
    return target !== undefined && target.status === 'active' && target.categoryCode !== categoryCode ? target : null;
  }

  /**
   * 本地搜索在用条目：查询词的比较键包含于展示名称或某个别名的比较键中即命中。
   * 命中别名时返回的仍是目录条目本身（规范代码）。顺序固定为分类顺序、再按 `sortOrder`，不做相关性打分。
   * 可以限定分类；查询为空时返回空列表。
   *
   * 这里的包含匹配只用于给用户列出候选，最终由用户自己点选；结果再多（哪怕只有一条）也不会自动选中，
   * 旧数据迁移也不走搜索。例如「隆鼻」不是任何条目的别名，但会因包含于「隆鼻手术」而列出鼻整形术作为候选。
   */
  function searchServices(query: string, categoryCode?: string): readonly ServiceSearchResult[] {
    const key = normalizeServiceName(query);
    if (key === '') {
      return NO_RESULTS;
    }
    const results: ServiceSearchResult[] = [];
    for (const item of searchKeys) {
      if (categoryCode !== undefined && item.entry.categoryCode !== categoryCode) {
        continue;
      }
      if (item.displayKey.includes(key)) {
        results.push(Object.freeze({ entry: item.entry, matchedAlias: null }));
        continue;
      }
      const alias = item.aliasKeys.find((aliasKey) => aliasKey.key.includes(key));
      if (alias !== undefined) {
        results.push(Object.freeze({ entry: item.entry, matchedAlias: alias.alias }));
      }
    }
    return Object.freeze(results);
  }

  const migrationIndex = buildServiceMigrationIndex(services);
  const migrationDigest = serviceMigrationDigest(services);
  const crossCategoryIndex = buildLegacyCrossCategoryIndex(crossCategoryMappings);
  const crossCategoryDigest = legacyCrossCategoryDigest(crossCategoryMappings);

  return Object.freeze({
    migrationIndex,
    migrationDigest,
    crossCategoryIndex,
    crossCategoryDigest,
    listServiceCategories,
    listActiveServices,
    findServiceByCode,
    listDeprecatedServices,
    isServiceCategoryCode,
    isKnownServiceCode,
    isServiceInCategory,
    getServiceCategoryDisplayName,
    standardServiceSelection,
    customServiceSelection,
    isValidNewServiceSelection,
    getServiceSelectionDisplayName,
    matchLegacyServiceName,
    searchServices,
  });
}

export type ServiceCatalogQueries = ReturnType<typeof createServiceCatalogQueries>;

/** 绑定到当前打包目录的查询。 */
export const serviceCatalog: ServiceCatalogQueries = createServiceCatalogQueries(
  SERVICE_CATEGORIES,
  SERVICES,
  LEGACY_CROSS_CATEGORY_MAPPINGS,
);

export const {
  listServiceCategories,
  listActiveServices,
  findServiceByCode,
  listDeprecatedServices,
  isServiceCategoryCode,
  isKnownServiceCode,
  isServiceInCategory,
  getServiceCategoryDisplayName,
  standardServiceSelection,
  customServiceSelection,
  isValidNewServiceSelection,
  getServiceSelectionDisplayName,
  matchLegacyServiceName,
  searchServices,
} = serviceCatalog;
