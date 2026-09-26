/**
 * 省级与地级行政区静态目录（ADR-024、DATA_MODEL_V4 第 8.1 节）。
 *
 * 随 App 打包、运行时不联网，不在用户数据库中建表，也不进入备份：
 * 用户数据里只保存选择当时的代码与名称快照。
 */

import { CITIES, PROVINCES } from './catalog';
import { validateAdministrativeDivisions } from './validate-catalog';

if (__DEV__) {
  const problems = validateAdministrativeDivisions(PROVINCES, CITIES);
  if (problems.length > 0) {
    // 开发环境直接抛错；生产环境不执行这段检查，界面不会显示任何技术细节。
    throw new Error(`行政区目录存在问题：\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  }
}

export { CITIES, PROVINCES } from './catalog';
export {
  findCityByCode,
  findProvinceByCode,
  formatProvinceCitySelection,
  isStandardPair,
  isValidProvinceCitySelection,
  listSelectableCities,
  listSelectableProvinces,
  normalizeCustomRegionText,
  otherRegionSelection,
  provinceCustomCitySelection,
  standardSelectionFromCity,
} from './helpers';
export { ADMINISTRATIVE_DIVISION_METADATA } from './metadata';
export type {
  CityCoverage,
  CityEntry,
  CityEntryKind,
  DivisionStatus,
  ProvinceCitySelection,
  ProvinceEntry,
} from './types';
