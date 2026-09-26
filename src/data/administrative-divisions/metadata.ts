/**
 * 行政区目录的来源与版本（ADR-024：随 App 打包的版本化静态目录）。
 *
 * 这是一份**官方 2023 年版**数据，不是「最新版」：官方页面没有给出生效日期或数据截止日期，
 * 核对当天民政部动态查询平台在开发环境中无法访问，2023 年以后的地级区划变化**尚未核对**。
 * 取得更新的官方代码表后，整份替换 `catalog.ts` 并升级 `catalogVersion`，不逐条手改。
 */
export const ADMINISTRATIVE_DIVISION_METADATA = {
  /** 目录版本。数据有任何变化都要升级，旧版本号不复用 */
  catalogVersion: 'mca-2023.1',
  sourceName: '民政部《2023年中华人民共和国县以上行政区划代码》',
  sourceUrl: 'https://www.mca.gov.cn/mzsj/xzqh/2023/202301xzqh.html',
  /** 官方数据的版本年份 */
  officialVersionYear: 2023,
  /** 官方页面未给出生效日期 */
  officialEffectiveDate: null,
  /** 官方页面未给出数据截止日期 */
  officialDataCutoffDate: null,
  /** 逐条核对官方页面的日期 */
  checkedOn: '2026-09-26',
  /** 是否核对过 2023 年以后的变化：民政部动态查询平台当时无法访问，未核对 */
  laterChangesChecked: false,
  counts: {
    /** 省级地区（含台湾省、香港、澳门） */
    provinces: 34,
    /** 官方地级条目 */
    officialPrefectureEntries: 333,
    /** 直辖市展示别名：北京市、天津市、上海市、重庆市，复用官方省级代码，不是官方地级条目 */
    municipalityDisplayAliases: 4,
    /** 标准二级条目 = 官方地级条目 + 直辖市展示别名，**不能**称为 337 个官方地级行政区 */
    standardCityEntries: 337,
    /** 二级只能选「暂未收录」的省级地区：台湾省、香港特别行政区、澳门特别行政区 */
    unlistedOnlyProvinces: 3,
  },
} as const;
