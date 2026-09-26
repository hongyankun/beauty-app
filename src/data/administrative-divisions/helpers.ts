/**
 * 行政区目录的查询与选择结果构造。全部是纯函数，不依赖 React Native、数据库或网络。
 *
 * 用户填写的文字只做去除首尾空格：不补「省」「市」，不做模糊、拼音或别名匹配，
 * 也不会因为文字与某个目录名称相同或相近就换成标准代码——找不到就是找不到，
 * 猜一个代码写进去比留空更难纠正。
 */

import { CITIES, PROVINCES } from './catalog';
import type { CityEntry, ProvinceCitySelection, ProvinceEntry } from './types';

function byCode<T extends { readonly code: string }>(left: T, right: T): number {
  if (left.code < right.code) {
    return -1;
  }
  return left.code > right.code ? 1 : 0;
}

// 省级与地级是两个命名空间，分别建索引：直辖市在两边用的是同一个代码。
const PROVINCE_BY_CODE: ReadonlyMap<string, ProvinceEntry> = new Map(
  PROVINCES.map((province) => [province.code, province]),
);
const CITY_BY_CODE: ReadonlyMap<string, CityEntry> = new Map(CITIES.map((city) => [city.code, city]));

// 列表由冻结的目录派生，本身也冻结：调用方拿到的是共享数组，不能在上面 sort 或 push。
const SELECTABLE_PROVINCES: readonly ProvinceEntry[] = Object.freeze(
  PROVINCES.filter((province) => province.status === 'active').sort(byCode),
);

const SELECTABLE_CITIES_BY_PROVINCE: ReadonlyMap<string, readonly CityEntry[]> = new Map(
  SELECTABLE_PROVINCES.map((province) => [
    province.code,
    Object.freeze(
      CITIES.filter((city) => city.parentCode === province.code && city.status === 'active').sort(byCode),
    ),
  ]),
);

const NO_CITIES: readonly CityEntry[] = Object.freeze([]);

/** 新建选择时可选的省级地区，按官方代码升序。已停用的不在其中。 */
export function listSelectableProvinces(): readonly ProvinceEntry[] {
  return SELECTABLE_PROVINCES;
}

/** 某个省级地区下可选的标准二级条目，按代码升序；台湾省、香港、澳门与未知代码为空列表。 */
export function listSelectableCities(provinceCode: string): readonly CityEntry[] {
  return SELECTABLE_CITIES_BY_PROVINCE.get(provinceCode) ?? NO_CITIES;
}

/** 按省级代码查找，含已停用条目（用于显示历史）。只查省级命名空间。 */
export function findProvinceByCode(code: string): ProvinceEntry | null {
  return PROVINCE_BY_CODE.get(code) ?? null;
}

/** 按二级代码查找城市及其所属省级地区，含已停用条目。只查二级命名空间。 */
export function findCityByCode(
  code: string,
): { readonly city: CityEntry; readonly province: ProvinceEntry } | null {
  const city = CITY_BY_CODE.get(code);
  if (city === undefined) {
    return null;
  }
  const province = PROVINCE_BY_CODE.get(city.parentCode);
  return province === undefined ? null : { city, province };
}

/** 这对代码是否是目录中真实存在的「省 + 市」。直辖市的合法组合是省级代码与自身配对。 */
export function isStandardPair(provinceCode: string, cityCode: string): boolean {
  const found = findCityByCode(cityCode);
  return found !== null && found.province.code === provinceCode;
}

/**
 * 用户填写的地区文字：去除首尾空格后不能为空。不合法时为 null。
 * 中间的空格原样保留，不替用户改写。
 */
export function normalizeCustomRegionText(raw: string): string | null {
  const text = raw.trim();
  return text === '' ? null : text;
}

/** 由目录中的一个二级条目构造标准结果（状态 C），名称取目录当前名称。代码不存在时为 null。 */
export function standardSelectionFromCity(cityCode: string): ProvinceCitySelection | null {
  const found = findCityByCode(cityCode);
  if (found === null) {
    return null;
  }
  return {
    kind: 'standard',
    provinceCode: found.province.code,
    provinceName: found.province.displayName,
    cityCode: found.city.code,
    city: found.city.displayName,
  };
}

/** 省来自目录、城市由用户填写（状态 B）。省代码不存在或文字为空时为 null。 */
export function provinceCustomCitySelection(
  provinceCode: string,
  rawCity: string,
): ProvinceCitySelection | null {
  const province = findProvinceByCode(provinceCode);
  const city = normalizeCustomRegionText(rawCity);
  if (province === null || city === null) {
    return null;
  }
  return {
    kind: 'province_custom_city',
    provinceCode: province.code,
    provinceName: province.displayName,
    cityCode: null,
    city,
  };
}

/** 「其他地区」：只保存用户填写的文字，不带任何代码。文字为空时为 null。 */
export function otherRegionSelection(rawText: string): ProvinceCitySelection | null {
  const city = normalizeCustomRegionText(rawText);
  return city === null ? null : { kind: 'other_region', provinceCode: null, provinceName: null, cityCode: null, city };
}

function isNonEmptyTrimmed(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim();
}

const SELECTION_KEYS = ['city', 'cityCode', 'kind', 'provinceCode', 'provinceName'] as const;

function hasExactlySelectionKeys(value: object): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === SELECTION_KEYS.length && keys.every((key, index) => key === SELECTION_KEYS[index]);
}

/**
 * 运行时校验一个**新选择**的省市结果：参数是 `unknown`，可以直接喂表单状态或路由参数。
 *
 * TypeScript 的类型是结构化的，任何人都能手写一个「长得像」`ProvinceCitySelection` 的对象，
 * 类型检查挡不住伪造的代码或对不上的名称，所以**写入之前**（BT-0019B2 的服务层）必须再调用一次本函数，
 * 不能因为值来自选择器就跳过。与构造函数共用同一份目录索引，判断依据只有一处。
 *
 * - 字段恰好是五个，不多不少；类型不对、多出字段都不通过。
 * - `standard`：两个代码必须是目录中真实存在、且互相配对的「省 + 市」（直辖市是省级代码与自身配对），
 *   两个名称必须**等于**目录中这两个代码的名称。
 * - `province_custom_city`：省级代码存在，省名称等于目录名称，`cityCode` 为 null，城市文字去空格后不为空。
 * - `other_region`：三个代码与省名称全部为 null，地区文字去空格后不为空。
 *
 * 名称按目录**当前**名称校验。已停用的条目仍能通过（目录里查得到），新建时选择器本身只列在用条目。
 *
 * **只用于**：从当前选择器新选出的地点；用户主动修改地点后、BT-0019B2 服务层写入之前的校验；
 * 确认标准城市属于所选省份。
 *
 * **不用于**：App 启动时重新校验数据库里已有的地点；显示数据库旧记录，以及机构、套餐、变美记录上的
 * 历史地点快照；备份 v1 / v2 的通用结构校验；从备份恢复旧地点；因目录更新批量改写名称快照。
 * 目录更新、改名、停用代码，或旧版本 App 存下了当前目录不认识的代码时，已有数据照常按保存时的名称快照显示，
 * 不因当前目录不认识或名称不同而删除、清空、拒绝加载，也不自动改写；只有用户主动重新选择时才写入当前标准代码与名称。
 *
 * 「已保存的值 → 选择器草稿」的适配由 BT-0019B2 设计并验收：当前目录认识的代码按代码定位，
 * 名称与当前目录不同也不清空；不认识的代码保留并显示原文字，不猜测映射。
 */
export function isValidProvinceCitySelection(value: unknown): value is ProvinceCitySelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !hasExactlySelectionKeys(value)) {
    return false;
  }
  const candidate = value as Record<(typeof SELECTION_KEYS)[number], unknown>;
  switch (candidate.kind) {
    case 'standard': {
      if (typeof candidate.provinceCode !== 'string' || typeof candidate.cityCode !== 'string') {
        return false;
      }
      const found = findCityByCode(candidate.cityCode);
      return (
        found !== null &&
        found.province.code === candidate.provinceCode &&
        candidate.provinceName === found.province.displayName &&
        candidate.city === found.city.displayName
      );
    }
    case 'province_custom_city': {
      if (typeof candidate.provinceCode !== 'string') {
        return false;
      }
      const province = findProvinceByCode(candidate.provinceCode);
      return (
        province !== null &&
        candidate.provinceName === province.displayName &&
        candidate.cityCode === null &&
        isNonEmptyTrimmed(candidate.city)
      );
    }
    case 'other_region':
      return (
        candidate.provinceCode === null &&
        candidate.provinceName === null &&
        candidate.cityCode === null &&
        isNonEmptyTrimmed(candidate.city)
      );
    default:
      return false;
  }
}

/**
 * 选择结果的中文展示，例如「广东省 · 深圳市」「北京市」「广东省 · 某某（暂未收录）」。
 * 直辖市的省与市同名，只显示一次。
 */
export function formatProvinceCitySelection(value: ProvinceCitySelection): string {
  switch (value.kind) {
    case 'standard':
      return value.provinceCode === value.cityCode ? value.city : `${value.provinceName} · ${value.city}`;
    case 'province_custom_city':
      return `${value.provinceName} · ${value.city}（暂未收录）`;
    case 'other_region':
      return `其他地区 · ${value.city}`;
    default:
      return '';
  }
}
