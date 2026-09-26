/**
 * 七个一级分类，代码与名称与 v3 套餐项目分类完全一致（`src/db/constants.ts`、
 * `src/features/purchases/categories.ts`）。本目录不引用数据库与业务模块，这里单独保留一份，
 * 两者是否一致由验证脚本核对。
 *
 * 分类原样冻结（DATA_MODEL_V4 第 8.2 节）：不增、不删、不合并、不改名。
 */

import type { ServiceCategoryCode, ServiceCategoryEntry } from './types';

export const SERVICE_CATEGORY_CODES: readonly ServiceCategoryCode[] = Object.freeze([
  'light_energy',
  'injection',
  'chemical_peel',
  'mesotherapy',
  'cleansing',
  'surgery',
  'other',
] as const);

export const SERVICE_CATEGORIES: readonly ServiceCategoryEntry[] = Object.freeze(
  (
    [
      { code: 'light_energy', displayName: '光电类', sortOrder: 10, hasCatalogServices: true },
      { code: 'injection', displayName: '注射类', sortOrder: 20, hasCatalogServices: true },
      { code: 'chemical_peel', displayName: '化学焕肤', sortOrder: 30, hasCatalogServices: true },
      { code: 'mesotherapy', displayName: '中胚层微针', sortOrder: 40, hasCatalogServices: true },
      { code: 'cleansing', displayName: '清洁', sortOrder: 50, hasCatalogServices: true },
      { code: 'surgery', displayName: '手术类', sortOrder: 60, hasCatalogServices: true },
      { code: 'other', displayName: '其他', sortOrder: 70, hasCatalogServices: false },
    ] satisfies ServiceCategoryEntry[]
  ).map((category) => Object.freeze(category)),
);
