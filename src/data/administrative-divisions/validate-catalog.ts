/**
 * 行政区目录的完整性检查。开发环境加载目录时执行（见 `./index.ts`），返回问题列表，空列表表示通过。
 *
 * 目录随 App 打包，线上没有修正入口，数据错误必须在开发期就暴露出来。
 */

import { ADMINISTRATIVE_DIVISION_METADATA } from './metadata';
import type { CityEntry, ProvinceEntry } from './types';

const PROVINCE_CODE_PATTERN = /^[1-9]\d0000$/;
/** 地级代码：后两位为 00，中间两位不是 00，也不是省直辖县级行政单位的汇总码 90 */
const PREFECTURE_CODE_PATTERN = /^[1-9]\d(?!00|90)\d{2}00$/;

/** 四个直辖市：二级条目是复用省级代码的展示别名 */
export const MUNICIPALITY_CODES: readonly string[] = ['110000', '120000', '310000', '500000'];

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

function isSortedByCode(entries: readonly { readonly code: string }[]): boolean {
  return entries.every((entry, index) => index === 0 || entries[index - 1].code < entry.code);
}

export function validateAdministrativeDivisions(
  provinces: readonly ProvinceEntry[],
  cities: readonly CityEntry[],
): string[] {
  const problems: string[] = [];
  const provinceByCode = new Map(provinces.map((province) => [province.code, province]));

  for (const code of findDuplicates(provinces.map((province) => province.code))) {
    problems.push(`省级代码重复：${code}`);
  }
  for (const name of findDuplicates(provinces.map((province) => province.displayName))) {
    problems.push(`省级名称重复：${name}`);
  }
  for (const code of findDuplicates(cities.map((city) => city.code))) {
    problems.push(`二级代码重复：${code}`);
  }
  for (const name of findDuplicates(cities.map((city) => city.displayName))) {
    problems.push(`二级名称重复：${name}`);
  }
  if (!isSortedByCode(provinces)) {
    problems.push('省级条目没有按代码严格升序排列');
  }
  if (!isSortedByCode(cities)) {
    problems.push('二级条目没有按代码严格升序排列');
  }

  for (const province of provinces) {
    // 正则会把数字悄悄转成字符串再匹配，所以先单独确认代码是字符串。
    if (typeof province.code !== 'string' || !PROVINCE_CODE_PATTERN.test(province.code)) {
      problems.push(`省级代码格式不对：${province.code}`);
    }
    if (province.displayName.trim() === '' || province.displayName !== province.displayName.trim()) {
      problems.push(`省级名称为空或带首尾空格：${province.code}`);
    }
    const hasCities = cities.some((city) => city.parentCode === province.code);
    if (province.cityCoverage === 'listed' && !hasCities) {
      problems.push(`省级地区标为有二级条目，但一个都没有：${province.code}`);
    }
    if (province.cityCoverage === 'unlisted_only' && hasCities) {
      problems.push(`省级地区标为只能「暂未收录」，却有二级条目：${province.code}`);
    }
  }

  for (const city of cities) {
    if (typeof city.code !== 'string' || typeof city.parentCode !== 'string') {
      problems.push(`二级代码或上级代码不是字符串：${String(city.code)}`);
      continue;
    }
    if (city.displayName.trim() === '' || city.displayName !== city.displayName.trim()) {
      problems.push(`二级名称为空或带首尾空格：${city.code}`);
    }
    const parent = provinceByCode.get(city.parentCode);
    if (parent === undefined) {
      problems.push(`二级条目的上级不存在：${city.code} → ${city.parentCode}`);
      continue;
    }
    if (city.kind === 'municipality_alias') {
      if (!MUNICIPALITY_CODES.includes(city.parentCode)) {
        problems.push(`只有直辖市可以有展示别名：${city.code}`);
      }
      if (city.code !== city.parentCode || city.displayName !== parent.displayName) {
        problems.push(`直辖市展示别名必须复用省级代码与名称：${city.code}`);
      }
    } else {
      if (!PREFECTURE_CODE_PATTERN.test(city.code)) {
        problems.push(`地级代码格式不对：${city.code}`);
      }
      if (city.code.slice(0, 2) !== city.parentCode.slice(0, 2)) {
        problems.push(`地级代码与上级省份不一致：${city.code} → ${city.parentCode}`);
      }
      if (MUNICIPALITY_CODES.includes(city.parentCode)) {
        problems.push(`直辖市下不应有官方地级条目：${city.code}`);
      }
    }
  }

  // 省级与地级是两个命名空间；跨命名空间同码只允许是四个直辖市别名。
  const cityCodes = new Set(cities.map((city) => city.code));
  const sharedCodes = provinces.map((province) => province.code).filter((code) => cityCodes.has(code));
  const unexpectedShared = sharedCodes.filter((code) => !MUNICIPALITY_CODES.includes(code));
  if (unexpectedShared.length > 0) {
    problems.push(`省级与二级之间出现直辖市以外的同码：${unexpectedShared.join('、')}`);
  }

  const { counts } = ADMINISTRATIVE_DIVISION_METADATA;
  const prefectureCount = cities.filter((city) => city.kind === 'prefecture').length;
  const aliasCount = cities.filter((city) => city.kind === 'municipality_alias').length;
  const unlistedOnlyCount = provinces.filter((province) => province.cityCoverage === 'unlisted_only').length;
  if (provinces.length !== counts.provinces) {
    problems.push(`省级条目数 ${provinces.length} 与来源说明 ${counts.provinces} 不一致`);
  }
  if (prefectureCount !== counts.officialPrefectureEntries) {
    problems.push(`官方地级条目数 ${prefectureCount} 与来源说明 ${counts.officialPrefectureEntries} 不一致`);
  }
  if (aliasCount !== counts.municipalityDisplayAliases) {
    problems.push(`直辖市展示别名数 ${aliasCount} 与来源说明 ${counts.municipalityDisplayAliases} 不一致`);
  }
  if (cities.length !== counts.standardCityEntries) {
    problems.push(`标准二级条目数 ${cities.length} 与来源说明 ${counts.standardCityEntries} 不一致`);
  }
  if (unlistedOnlyCount !== counts.unlistedOnlyProvinces) {
    problems.push(`只能「暂未收录」的省级地区数 ${unlistedOnlyCount} 与来源说明 ${counts.unlistedOnlyProvinces} 不一致`);
  }

  return problems;
}
