/**
 * 项目两级目录（ADR-024、DATA_MODEL_V4 第 8.2、8.3 节）。
 *
 * 随 App 打包、运行时不联网，不在用户数据库中建表，也不进入备份：
 * 用户数据里只保存选择当时的分类代码、项目代码与名称快照。目录与百科互相独立，不一一对应。
 */

import { SERVICE_CATEGORIES } from './categories';
import { LEGACY_CROSS_CATEGORY_MAPPINGS } from './legacy-cross-category';
import { SERVICE_CATALOG_METADATA } from './metadata';
import { SERVICES } from './services';
import { validateServiceCatalog } from './validate-catalog';

if (__DEV__) {
  const problems = validateServiceCatalog(
    SERVICE_CATEGORIES,
    SERVICES,
    LEGACY_CROSS_CATEGORY_MAPPINGS,
    SERVICE_CATALOG_METADATA.counts,
  );
  if (problems.length > 0) {
    // 开发环境直接抛错；生产环境不执行这段检查，界面不会显示任何技术细节。
    throw new Error(`项目目录存在问题：\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  }
}

export { SERVICE_CATEGORIES, SERVICE_CATEGORY_CODES } from './categories';
export {
  buildLegacyCrossCategoryIndex,
  buildServiceMigrationIndex,
  cleanServiceName,
  customServiceSelection,
  findServiceByCode,
  getServiceCategoryDisplayName,
  getServiceSelectionDisplayName,
  isKnownServiceCode,
  isServiceCategoryCode,
  isServiceInCategory,
  isValidNewServiceSelection,
  legacyCrossCategoryDigest,
  listActiveServices,
  listDeprecatedServices,
  listServiceCategories,
  matchLegacyServiceName,
  normalizeServiceName,
  searchServices,
  serviceMigrationDigest,
  serviceMigrationKeys,
  standardServiceSelection,
  UNKNOWN_CATEGORY_DISPLAY_NAME,
} from './helpers';
export type { LegacyCrossCategoryKey, ServiceMigrationKey } from './helpers';
export { LEGACY_CROSS_CATEGORY_MAPPINGS } from './legacy-cross-category';
export { SERVICE_CATALOG_METADATA } from './metadata';
export { SERVICES } from './services';
export type {
  LegacyCrossCategoryMapping,
  ServiceBasis,
  ServiceCategoryCode,
  ServiceCategoryEntry,
  ServiceEntry,
  ServiceSearchResult,
  ServiceSelection,
  ServiceStatus,
} from './types';
