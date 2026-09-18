/**
 * 百科内容的类型定义。
 *
 * 百科正文是随 App 打包的**本地只读内容**，不落 SQLite、不走网络，
 * 因此这里定义的是内容结构，不是数据库行（任务书第七、十三节）。
 *
 * 分类只有四个，使用稳定英文代码，中文名称仅用于显示；
 * PRD 第 10.1 节提到的五类「长期内容类型体系」本轮不落到代码。
 */

/** 四个浏览分类，顺序即首页 Chip 的顺序。 */
export const ARTICLE_CATEGORIES = [
  { code: 'basics', name: '基础认知' },
  { code: 'lightAndEnergy', name: '光电项目' },
  { code: 'injectables', name: '注射项目' },
  { code: 'careAndSafety', name: '护理与安全' },
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]['code'];

/** 分类代码到中文名称的映射，供详情页与卡片显示。 */
export const CATEGORY_NAMES: Readonly<Record<ArticleCategory, string>> = Object.fromEntries(
  ARTICLE_CATEGORIES.map((category) => [category.code, category.name]),
) as Readonly<Record<ArticleCategory, string>>;

/**
 * 来源类型。只收录监管机构、公立医疗体系、医学专业学会与公共医学信息库，
 * 不收录商业医美机构的营销内容与社交平台内容（任务书第六节）。
 */
export const SOURCE_KIND_NAMES = {
  regulator: '监管机构',
  publicHealth: '公立医疗体系',
  professionalSociety: '医学专业学会',
  medicalLibrary: '公共医学信息库',
} as const;

export type ArticleSourceKind = keyof typeof SOURCE_KIND_NAMES;

export type ArticleSource = {
  /** 稳定标识，供文章引用同一条来源时复用 */
  readonly id: string;
  /** 发布机构或作者 */
  readonly publisher: string;
  /** 资料标题，保留原文标题 */
  readonly title: string;
  /** 必须是实际可访问的 http/https 链接 */
  readonly url: string;
  readonly kind: ArticleSourceKind;
};

export type ArticleSection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
};

/**
 * 内容复核状态。
 *
 * - `draft`：内容草稿，来源或正文尚未完成核验。
 * - `sourceChecked`：资料来源已逐条核验，但尚未经过专业医学人员复核。
 * - `expertReviewed`：已经由明确的专业医学责任人复核。
 *
 * 首版全部文章最多只能到 `sourceChecked`：PRD 第 20.1 节 Q-04 的专业审核
 * 责任人尚未确定，没有人可以为「已复核」背书。校验会拒绝 `expertReviewed`。
 */
export const REVIEW_STATUSES = ['draft', 'sourceChecked', 'expertReviewed'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type EncyclopediaArticle = {
  /** 稳定标识，路由参数用它 */
  readonly id: string;
  /** 稳定别名，与 id 同样唯一，便于以后做可读链接 */
  readonly slug: string;
  readonly title: string;
  /** 一句话摘要 */
  readonly summary: string;
  readonly category: ArticleCategory;
  /** 展示用标签，同时参与搜索 */
  readonly tags: readonly string[];
  /** 只参与搜索、不展示的别名，覆盖俗称与英文写法 */
  readonly aliases: readonly string[];
  /** 结构化正文，至少一个章节 */
  readonly sections: readonly ArticleSection[];
  /** 需要知道的限制 */
  readonly limitations: readonly string[];
  /** 什么时候应及时联系专业人员 */
  readonly seekHelp: readonly string[];
  /** 至少一条权威来源；治疗类文章原则上至少两条独立来源 */
  readonly sources: readonly ArticleSource[];
  /** 本次内容与来源的复核日期，YYYY-MM-DD。不代表专业医学人员背书 */
  readonly reviewedOn: string;
  readonly reviewStatus: ReviewStatus;
};
