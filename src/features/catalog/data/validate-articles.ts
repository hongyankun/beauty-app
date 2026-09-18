import { ARTICLE_CATEGORIES, REVIEW_STATUSES } from '../types';
import type { EncyclopediaArticle } from '../types';

const CATEGORY_CODES = new Set<string>(ARTICLE_CATEGORIES.map((category) => category.code));
const REVIEW_STATUS_CODES = new Set<string>(REVIEW_STATUSES);

/** 需要复核日期的审核状态。草稿允许没有完成核验，因此不强制。 */
const STATUSES_REQUIRING_REVIEW_DATE = new Set<string>(['sourceChecked', 'expertReviewed']);

/**
 * 治疗类文章原则上至少要有两个独立权威来源（任务书第六节）。
 * 「基础认知」不直接描述某一类操作，只要求至少一个。
 */
const SINGLE_SOURCE_CATEGORIES = new Set<string>(['basics']);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * 内容完整性校验。
 *
 * 这些文章是正式产品内容，直接打包进 App，没有后台可以兜底，
 * 写错了只能靠这里在开发阶段拦下来。函数本身是纯函数，返回问题清单，
 * 由调用方决定是抛错还是忽略（生产环境不执行，见 data/index.ts）。
 */
export function validateArticles(articles: readonly EncyclopediaArticle[]): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  articles.forEach((article, index) => {
    const label = article.id.length > 0 ? article.id : `第 ${index + 1} 篇`;

    if (isBlank(article.id)) {
      problems.push(`${label}：id 不能为空`);
    } else if (seenIds.has(article.id)) {
      problems.push(`${label}：id 重复`);
    } else {
      seenIds.add(article.id);
    }

    if (isBlank(article.slug)) {
      problems.push(`${label}：slug 不能为空`);
    } else if (seenSlugs.has(article.slug)) {
      problems.push(`${label}：slug「${article.slug}」重复`);
    } else {
      seenSlugs.add(article.slug);
    }

    if (isBlank(article.title)) {
      problems.push(`${label}：标题不能为空`);
    }
    if (isBlank(article.summary)) {
      problems.push(`${label}：摘要不能为空`);
    }

    if (!CATEGORY_CODES.has(article.category)) {
      problems.push(`${label}：分类「${article.category}」不在允许的分类中`);
    }

    if (article.sections.length === 0) {
      problems.push(`${label}：至少需要一个正文章节`);
    }
    article.sections.forEach((section, sectionIndex) => {
      const sectionLabel = `${label} 第 ${sectionIndex + 1} 个章节`;
      if (isBlank(section.heading)) {
        problems.push(`${sectionLabel}：小标题不能为空`);
      }
      if (section.paragraphs.length === 0) {
        problems.push(`${sectionLabel}：正文不能为空`);
      }
      if (section.paragraphs.some(isBlank)) {
        problems.push(`${sectionLabel}：存在空段落`);
      }
    });

    if (article.limitations.length === 0) {
      problems.push(`${label}：缺少「需要知道的限制」`);
    }
    if (article.limitations.some(isBlank)) {
      problems.push(`${label}：「需要知道的限制」存在空条目`);
    }
    if (article.seekHelp.length === 0) {
      problems.push(`${label}：缺少「什么时候应及时联系专业人员」`);
    }
    if (article.seekHelp.some(isBlank)) {
      problems.push(`${label}：「什么时候应及时联系专业人员」存在空条目`);
    }

    const minimumSources = SINGLE_SOURCE_CATEGORIES.has(article.category) ? 1 : 2;
    if (article.sources.length < minimumSources) {
      problems.push(`${label}：至少需要 ${minimumSources} 个权威来源，当前只有 ${article.sources.length} 个`);
    }
    const seenSourceIds = new Set<string>();
    article.sources.forEach((source) => {
      if (seenSourceIds.has(source.id)) {
        problems.push(`${label}：来源「${source.id}」重复引用`);
      } else {
        seenSourceIds.add(source.id);
      }
      if (isBlank(source.publisher) || isBlank(source.title)) {
        problems.push(`${label}：来源「${source.id}」缺少机构或标题`);
      }
      if (!isHttpUrl(source.url)) {
        problems.push(`${label}：来源「${source.id}」的链接不是 http 或 https 地址`);
      }
    });

    if (!REVIEW_STATUS_CODES.has(article.reviewStatus)) {
      problems.push(`${label}：审核状态「${article.reviewStatus}」不在允许的取值中`);
    }
    if (article.reviewStatus === 'expertReviewed') {
      // 专业审核责任人尚未确定（PRD 第 20.1 节 Q-04），本轮任何文章都不得声称已经过专业复核。
      problems.push(`${label}：本轮不允许标记为 expertReviewed`);
    }
    if (STATUSES_REQUIRING_REVIEW_DATE.has(article.reviewStatus) && !isRealDate(article.reviewedOn)) {
      problems.push(`${label}：审核状态为「${article.reviewStatus}」时必须有合法的复核日期`);
    }
    if (!isBlank(article.reviewedOn) && !isRealDate(article.reviewedOn)) {
      problems.push(`${label}：复核日期「${article.reviewedOn}」不是合法的 YYYY-MM-DD 日期`);
    }
  });

  return problems;
}
