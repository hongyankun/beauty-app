/**
 * 项目两级目录的来源、定位与版本（ADR-024：随 App 打包的版本化静态目录）。
 *
 * 这份目录是**首版主流记录目录**：参照官方医疗美容项目分类与常见市场用语整理，
 * 用于让用户的记录有一致的归类。它不是医疗建议来源、设备或药品数据库、官方消费者名录、
 * 执业资质依据，也不是效果或安全性认证；不声称覆盖全部项目，找不到的项目始终可以自定义。
 */
export const SERVICE_CATALOG_METADATA = {
  /**
   * 目录版本。首版在第一次提交前定稿；第一次提交之后，条目、别名、旧名称或跨分类白名单的
   * 任何变化都要升级，旧版本号不复用
   */
  catalogVersion: 'svc-2026.1',
  /** 整理日期 */
  compiledOn: '2026-09-26',
  positioning:
    '基于官方医疗美容项目分类和常见市场用语整理的首版主流记录目录；未收录项目始终可以自定义。',
  nonExhaustiveNote: '目录不覆盖全部项目，也不代表未收录的项目不存在或不合规。',
  notMedicalAdviceNote:
    '目录只用于记录与归类，不构成医疗建议，不代表任何项目适合某个人，也不是效果或安全性的证明。',
  /**
   * 官方来源。《医疗美容项目分级管理目录》已由产品负责人核对，确认列有 A型肉毒毒素美容注射、填充物注射、
   * 重睑成形术、下睑袋矫正术、隆鼻术、脂肪抽吸术、毛发移植术、自体脂肪注射移植术，以及激光治疗、
   * 强脉冲光（IPL）、射频治疗、超声治疗、微针治疗、化学剥脱等类别。它只支撑技术类别与部分术式，
   * 不是本目录 37 个条目的逐条官方清单；条目粒度、别名与归并方式是美迹自己的设计。
   * `onlineChecked` 只表示整理环境能否直接打开该页面（国家卫生健康委站点有访问验证，未绕过）。
   */
  officialSources: [
    {
      name: '国家卫生健康委《医疗美容项目分级管理目录》',
      url: 'https://www.nhc.gov.cn/bgt/s10697/200912/b462cd0167db4b3b9d19d31e3c74160b.shtml',
      onlineChecked: false,
    },
    {
      name: '国家卫生健康委《医疗美容服务管理办法》',
      url: 'https://www.nhc.gov.cn/wjw/c100221/202201/d7e8fa33a26b425da98d69fb04191699.shtml',
      onlineChecked: false,
    },
    {
      name: '市场监管总局《医疗美容广告执法指南》（2021年第37号公告）',
      url: 'https://www.gov.cn/zhengce/zhengceku/2021-11/04/content_5648772.htm',
      onlineChecked: true,
    },
    {
      name: '国家卫生健康委等《打击非法医疗美容服务专项整治工作方案》（国卫办监督函〔2021〕273号）',
      url: 'https://www.gov.cn/zhengce/zhengceku/2021-06/11/content_5617048.htm',
      onlineChecked: true,
    },
  ],
  /** 通用技术名称的参考（监管机构与医学专业学会的公开资料），只用于确定通用名称 */
  professionalSources: [
    {
      name: 'U.S. FDA: Microneedling Devices',
      url: 'https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/microneedling-devices',
    },
    {
      name: 'American Academy of Dermatology: Chemical peels FAQs',
      url: 'https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-faqs',
    },
  ],
  /**
   * 市场叫法与品牌名的核对来源：只用于把品牌名放进对应通用条目的别名，
   * 不作为收录依据，也不引用任何销量或排名数据。
   */
  marketTermSources: [
    { name: 'Thermage（Solta Medical）官方网站', url: 'https://www.thermage.com/' },
    { name: 'Ultherapy（Merz Aesthetics）官方网站', url: 'https://ultherapy.com/' },
    { name: 'Hydrafacial 官方网站', url: 'https://hydrafacial.com/' },
  ],
  counts: {
    categories: 7,
    services: 37,
    activeServices: 37,
    deprecatedServices: 0,
    legacyCrossCategoryMappings: 2,
    basis: {
      official_category: 9,
      professional_consensus: 15,
      market_common: 13,
    },
  },
} as const;
