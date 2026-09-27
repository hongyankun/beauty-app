import { CITIES, PROVINCES } from '@/data/administrative-divisions';
import { normalizeInstitutionName } from '@/utils/institution-name';

/**
 * 旧城市文字 → 行政区代码的显式映射表（DATA_MODEL_V4 第 10.4 节）。
 *
 * 只用于 v3 → v4 迁移与备份 v1 → v2 转换，两处调用同一个函数，同一份旧数据得到相同结果。
 * 新建与编辑机构走省市选择器，不经过这里。
 *
 * 映射表由打包的行政区目录**一次性确定地**生成，之后冻结：
 *
 * 1. 每个在用城市（含四个直辖市的展示别名）贡献两个键：标准名称本身，
 *    以及去掉末尾「市」后的简称（至少两个字，例如「深圳市」→「深圳」）。
 *    自治州、地区、盟等名称只用全称，不做任何截断。
 * 2. 简称若与某个省级地区的简称相同（例如「吉林市」的简称「吉林」与「吉林省」），
 *    该简称不进表：用户写「吉林」时无法确定指的是省还是市。
 *    直辖市的展示别名与省级同码、同一个地方，不受影响（「上海」→ 上海市）。
 * 3. 同一个键指向两个不同城市时，该键整体丢弃，不猜测。
 * 4. 比较键使用与机构判重相同的归一化（去首尾空白、合并连续空白、英文小写）。
 *
 * 不做包含、拼音、错别字、繁简转换或相似度匹配；不从城市推断省份以外的任何信息；
 * 台湾省、香港、澳门在目录中没有城市，因此永远不会得到代码。
 */

export type LegacyCityMatch = {
  readonly provinceCode: string;
  readonly provinceName: string;
  readonly cityCode: string;
};

const PROVINCE_SUFFIXES = [
  '维吾尔自治区',
  '壮族自治区',
  '回族自治区',
  '特别行政区',
  '自治区',
  '省',
  '市',
] as const;

function provinceShortName(displayName: string): string {
  for (const suffix of PROVINCE_SUFFIXES) {
    if (displayName.endsWith(suffix) && displayName.length > suffix.length) {
      return displayName.slice(0, -suffix.length);
    }
  }
  return displayName;
}

function buildLegacyCityTable(): ReadonlyMap<string, LegacyCityMatch> {
  const provinceByCode = new Map(PROVINCES.map((province) => [province.code, province]));
  const provinceCodeByShortName = new Map<string, string>();
  for (const province of PROVINCES) {
    provinceCodeByShortName.set(normalizeInstitutionName(provinceShortName(province.displayName)), province.code);
  }

  const candidates = new Map<string, LegacyCityMatch[]>();
  const add = (key: string, match: LegacyCityMatch) => {
    const list = candidates.get(key);
    if (list === undefined) {
      candidates.set(key, [match]);
    } else if (!list.some((existing) => existing.cityCode === match.cityCode)) {
      list.push(match);
    }
  };

  for (const city of CITIES) {
    if (city.status !== 'active') {
      continue;
    }
    const province = provinceByCode.get(city.parentCode);
    if (province === undefined || province.status !== 'active') {
      continue;
    }
    const match: LegacyCityMatch = {
      provinceCode: province.code,
      provinceName: province.displayName,
      cityCode: city.code,
    };
    add(normalizeInstitutionName(city.displayName), match);

    if (city.displayName.endsWith('市') && city.displayName.length >= 3) {
      const shortKey = normalizeInstitutionName(city.displayName.slice(0, -1));
      const clashingProvince = provinceCodeByShortName.get(shortKey);
      if (clashingProvince === undefined || city.kind === 'municipality_alias') {
        add(shortKey, match);
      }
    }
  }

  const table = new Map<string, LegacyCityMatch>();
  for (const [key, list] of [...candidates.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (list.length === 1) {
      table.set(key, Object.freeze(list[0]));
    }
  }
  return table;
}

const LEGACY_CITY_TABLE = buildLegacyCityTable();

/**
 * 把一条旧城市文字映射到省市代码。只有归一化后**完全等于**表中某个键时才命中；
 * 空值、空白与未收录的文字一律返回 null。城市文字本身由调用方原样保留。
 */
export function mapLegacyCity(raw: string | null): LegacyCityMatch | null {
  if (raw === null) {
    return null;
  }
  const key = normalizeInstitutionName(raw);
  if (key === '') {
    return null;
  }
  return LEGACY_CITY_TABLE.get(key) ?? null;
}

/** 映射表的全部行，按键排序：`[键, 省代码, 市代码]`。用于审核与摘要。 */
export function legacyCityTableEntries(): readonly (readonly [key: string, provinceCode: string, cityCode: string])[] {
  return [...LEGACY_CITY_TABLE.entries()].map(([key, match]) => [key, match.provinceCode, match.cityCode] as const);
}

/**
 * 映射表的稳定摘要（FNV-1a 32 位），与项目目录迁移索引的摘要同一算法。
 * 审核时据此确认迁移与备份转换用的是同一张表，且口径没有被悄悄改动。
 */
export function legacyCityTableDigest(): string {
  const text = JSON.stringify(legacyCityTableEntries());
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
