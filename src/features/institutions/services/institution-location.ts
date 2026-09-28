import {
  findCityByCode,
  findProvinceByCode,
  formatProvinceCitySelection,
  isValidProvinceCitySelection,
  otherRegionSelection,
  provinceCustomCitySelection,
  standardSelectionFromCity,
  type ProvinceCitySelection,
} from '@/data/administrative-divisions';

/**
 * 机构结构化地点：数据库四列 ↔ 省市选择器之间的适配（BT-0019B2）。
 *
 * 全部是纯函数，不读写数据库。两个方向的规则刻意不对称：
 *
 * - **读**（`describeStoredLocation`）永远宽松：数据库里的值可能来自迁移前的城市文字、
 *   旧版本目录，或当前目录不认识的代码。这些值照常显示保存时的文字，不清空、不改写、
 *   不拒绝加载，也不调用严格校验（helpers.ts 的「不用于」清单）。
 * - **写**（`prepareLocationForWrite`）永远严格：只有用户这一次主动选出、且与数据库不同的地点
 *   才走到这里，必须通过 `isValidProvinceCitySelection`，写入的名称一律取目录当前名称。
 *
 * 只允许三种组合（DATA_MODEL_V4 第 4.7 节，表级 CHECK 同样约束）：
 * A 三个代码与省名称全空、城市文字可选；B 省代码 + 省名称、市代码为空、城市文字非空；
 * C 三个代码与名称齐全、城市为目录名称。
 */

/** `institutions` 上与地点有关的四列，原样来自数据库。 */
export type StoredLocation = {
  readonly province_code: string | null;
  readonly province_name: string | null;
  readonly city_code: string | null;
  readonly city: string | null;
};

/** 已保存、但不能直接当作选择结果的地点。只用于显示与预填，不会被原样写回。 */
export type LegacyLocation = {
  /** 保存时的文字，原样显示 */
  readonly text: string;
  /** 这是什么状态的说明 */
  readonly note: string;
  /** 打开选择器时预填的草稿；目录里按代码定位不到时为 null */
  readonly seed: ProvinceCitySelection | null;
};

export type InstitutionLocationView =
  | { readonly kind: 'empty' }
  /** 与当前目录完全一致的 B 或 C，可以直接交给选择器当作 value */
  | { readonly kind: 'selection'; readonly selection: ProvinceCitySelection }
  | { readonly kind: 'legacy'; readonly legacy: LegacyLocation };

export const TEXT_ONLY_NOTE = '未关联省市目录';
export const UNKNOWN_CODE_NOTE = '历史地点 · 当前目录未收录';
export const STALE_NAME_NOTE = '历史地点 · 名称与当前目录不同';

export const EMPTY_LOCATION: StoredLocation = Object.freeze({
  province_code: null,
  province_name: null,
  city_code: null,
  city: null,
});

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/** 保存时的「省 · 市」文字。直辖市省市同名，只显示一次；不查目录，不重新计算。 */
function savedText(stored: StoredLocation): string {
  const city = stored.city ?? '';
  if (stored.province_name === null || stored.province_name === '') {
    return city;
  }
  if (city === '' || (stored.city_code !== null && stored.city_code === stored.province_code)) {
    return city === '' ? stored.province_name : city;
  }
  return `${stored.province_name} · ${city}`;
}

/**
 * 数据库四列 → 页面上的地点状态。任何输入都不会抛出，也不会返回「加载失败」。
 */
export function describeStoredLocation(stored: StoredLocation): InstitutionLocationView {
  const { province_code: provinceCode, province_name: provinceName, city_code: cityCode, city } = stored;

  // 状态 A：没有任何代码。
  if (provinceCode === null && provinceName === null && cityCode === null) {
    if (city === null || isBlank(city)) {
      return { kind: 'empty' };
    }
    // 迁移前只有城市文字的机构，与用户主动选的「其他地区」在库里是同一种形态，
    // 都按保存的文字显示，不替它补一个「其他地区」前缀，也不按文字猜代码。
    return {
      kind: 'legacy',
      legacy: { text: city, note: TEXT_ONLY_NOTE, seed: otherRegionSelection(city) },
    };
  }

  // 状态 C：带市代码。
  if (provinceCode !== null && cityCode !== null) {
    const standard = standardSelectionFromCity(cityCode);
    const candidate = { kind: 'standard', provinceCode, provinceName, cityCode, city };
    if (standard !== null && isValidProvinceCitySelection(candidate)) {
      return { kind: 'selection', selection: candidate };
    }
    const locatedByCode = standard !== null && standard.provinceCode === provinceCode;
    const seed = locatedByCode
      ? standard
      : findProvinceByCode(provinceCode) !== null && city !== null
        ? provinceCustomCitySelection(provinceCode, city)
        : null;
    return {
      kind: 'legacy',
      legacy: {
        text: savedText(stored),
        note: locatedByCode ? STALE_NAME_NOTE : UNKNOWN_CODE_NOTE,
        seed,
      },
    };
  }

  // 状态 B：只有省代码。
  if (provinceCode !== null && cityCode === null) {
    const candidate = { kind: 'province_custom_city', provinceCode, provinceName, cityCode: null, city };
    if (isValidProvinceCitySelection(candidate)) {
      return { kind: 'selection', selection: candidate };
    }
    const province = findProvinceByCode(provinceCode);
    return {
      kind: 'legacy',
      legacy: {
        text: savedText(stored),
        note: province !== null ? STALE_NAME_NOTE : UNKNOWN_CODE_NOTE,
        seed: province !== null && city !== null ? provinceCustomCitySelection(provinceCode, city) : null,
      },
    };
  }

  // 表级 CHECK 不允许出现的组合（例如只有市代码）。照样显示文字，不猜测。
  return { kind: 'legacy', legacy: { text: savedText(stored), note: UNKNOWN_CODE_NOTE, seed: null } };
}

/** 列表与卡片上显示的地点文字；没有地点时为 null，整段省略。 */
export function formatStoredLocation(stored: StoredLocation): string | null {
  const view = describeStoredLocation(stored);
  switch (view.kind) {
    case 'selection':
      return formatProvinceCitySelection(view.selection);
    case 'legacy':
      return view.legacy.text === '' ? null : view.legacy.text;
    default:
      return null;
  }
}

/** 一个选择结果（或清除）对应的四列。 */
export function locationColumnsFromSelection(selection: ProvinceCitySelection | null): StoredLocation {
  if (selection === null) {
    return EMPTY_LOCATION;
  }
  return {
    province_code: selection.provinceCode,
    province_name: selection.provinceName,
    city_code: selection.cityCode,
    city: selection.city,
  };
}

/** 四列逐一严格相等。用于在事务内判断「这次提交的地点与库里现值是否相同」。 */
export function isSameStoredLocation(left: StoredLocation, right: StoredLocation): boolean {
  return (
    left.province_code === right.province_code &&
    left.province_name === right.province_name &&
    left.city_code === right.city_code &&
    left.city === right.city
  );
}

/**
 * 提交的地点（null 表示清除）与库里的四列是否完全相同。逐字段严格比较，不做校验：
 * 相同就意味着「没有修改」，调用方原样保留库里的值；页面伪造的字段必然对不上，随后由严格校验拒绝。
 */
export function selectionMatchesStored(
  value: ProvinceCitySelection | null,
  stored: StoredLocation,
): boolean {
  return isSameStoredLocation(locationColumnsFromSelection(value), stored);
}

/**
 * 用户主动选出的新地点 → 可以写入的四列。参数是 `unknown`：来自页面的值不可信。
 *
 * - null 表示清除，写成全空（状态 A 且没有文字）。
 * - 其余必须通过 `isValidProvinceCitySelection`，再由目录重新构造一次，
 *   写入的省、市名称都是目录当前名称，而不是页面传来的那一份。
 * - 通不过时返回 null，由调用方抛出各自领域的中文错误；绝不「尽力」写一个接近的值。
 */
export function prepareLocationForWrite(value: unknown): { readonly ok: true; readonly columns: StoredLocation } | { readonly ok: false } {
  if (value === null) {
    return { ok: true, columns: EMPTY_LOCATION };
  }
  if (!isValidProvinceCitySelection(value)) {
    return { ok: false };
  }
  let rebuilt: ProvinceCitySelection | null;
  switch (value.kind) {
    case 'standard': {
      const found = findCityByCode(value.cityCode);
      rebuilt = found === null ? null : standardSelectionFromCity(found.city.code);
      break;
    }
    case 'province_custom_city':
      rebuilt = provinceCustomCitySelection(value.provinceCode, value.city);
      break;
    case 'other_region':
      rebuilt = otherRegionSelection(value.city);
      break;
    default:
      rebuilt = null;
  }
  return rebuilt === null ? { ok: false } : { ok: true, columns: locationColumnsFromSelection(rebuilt) };
}

/** 地点写入失败时给用户看的话。不提代码、不提目录版本。 */
export const INVALID_LOCATION_MESSAGE = '选择的地区不在当前目录中，请重新选择省市';
