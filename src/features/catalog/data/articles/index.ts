import type { EncyclopediaArticle } from '../../types';

import { BOTULINUM_TOXIN } from './botulinum-toxin';
import { CONSULTATION_CHECKLIST } from './consultation-checklist';
import { HYALURONIC_ACID_FILLERS } from './hyaluronic-acid-fillers';
import { LIGHT_BASED_TREATMENTS } from './light-based';
import { MICRONEEDLING_AND_PEELS } from './microneedling-and-peels';
import { RADIOFREQUENCY_TREATMENTS } from './radiofrequency';
import { ULTRASOUND_TREATMENTS } from './ultrasound';
import { UNDERSTANDING_TREATMENTS } from './understanding-treatments';

/**
 * 百科文章全集。
 *
 * 数组顺序就是列表的展示顺序：先基础认知，再按项目类型排列，
 * 最后是护理与安全。搜索不做相关性评分，只按这个顺序过滤
 * （任务书第十节），所以这里的顺序是产品决定，不要随意调整。
 */
export const ARTICLES: readonly EncyclopediaArticle[] = [
  UNDERSTANDING_TREATMENTS,
  LIGHT_BASED_TREATMENTS,
  RADIOFREQUENCY_TREATMENTS,
  ULTRASOUND_TREATMENTS,
  HYALURONIC_ACID_FILLERS,
  BOTULINUM_TOXIN,
  MICRONEEDLING_AND_PEELS,
  CONSULTATION_CHECKLIST,
];
