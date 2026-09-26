/**
 * 行政区目录与选择结果的类型（DATA_MODEL_V4 第 4.7、8.1 节）。
 *
 * 目录只保存代码与名称，不保存拼音、别名、经纬度或任何需要联网的信息。
 * 业务上一律用 `code` 标识条目，不用数组下标，也不用中文名称。
 */

/** 条目状态：在用 / 已停用。已停用的条目仍能查到（用于显示历史），但不再出现在新建选择中。 */
export type DivisionStatus = 'active' | 'retired';

/**
 * 省级地区的二级覆盖情况。
 *
 * - `listed`：有标准二级条目可选（含直辖市的展示别名）。
 * - `unlisted_only`：官方代码表没有地级数据（台湾省、香港、澳门），二级只有「暂未收录」。
 */
export type CityCoverage = 'listed' | 'unlisted_only';

export type ProvinceEntry = {
  /** 官方省级代码，形如 `440000` */
  readonly code: string;
  readonly displayName: string;
  /** 省级没有上级，固定为 null */
  readonly parentCode: null;
  readonly status: DivisionStatus;
  readonly cityCoverage: CityCoverage;
};

/**
 * 二级条目的来源。
 *
 * - `prefecture`：官方地级条目，代码形如 `440300`。
 * - `municipality_alias`：美迹的「直辖市展示别名」。民政部代码表中没有名为北京市等的地级条目，
 *   这里复用官方**省级**代码，不能当作官方地级代码对外描述。
 */
export type CityEntryKind = 'prefecture' | 'municipality_alias';

export type CityEntry = {
  readonly code: string;
  readonly displayName: string;
  /** 所属省级地区的代码；每个城市恰好属于一个省级地区 */
  readonly parentCode: string;
  readonly status: DivisionStatus;
  readonly kind: CityEntryKind;
};

/**
 * 省市选择的结果，对应机构地点的三种合法状态（DATA_MODEL_V4 第 4.7 节）。
 * 「没有选择」用 `null` 表示，不是这里的第四种取值。
 *
 * - `standard`（状态 C）：省与市都来自目录。直辖市的 `provinceCode === cityCode`。
 * - `province_custom_city`（状态 B）：省来自目录，城市在目录中找不到，由用户填写。
 * - `other_region`（状态 A 且有文字）：省也找不到，只保存用户填写的地区文字。
 *
 * 名称是选择当时的目录名称快照；用户填写的文字已去除首尾空格且不为空。
 */
export type ProvinceCitySelection =
  | {
      readonly kind: 'standard';
      readonly provinceCode: string;
      readonly provinceName: string;
      readonly cityCode: string;
      readonly city: string;
    }
  | {
      readonly kind: 'province_custom_city';
      readonly provinceCode: string;
      readonly provinceName: string;
      readonly cityCode: null;
      readonly city: string;
    }
  | {
      readonly kind: 'other_region';
      readonly provinceCode: null;
      readonly provinceName: null;
      readonly cityCode: null;
      readonly city: string;
    };
