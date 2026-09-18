import type { InstitutionConflictRow } from '@/db';
import { cleanInstitutionName, normalizeInstitutionName } from '@/utils/institution-name';
import { InstitutionServiceError } from './errors';

/**
 * 机构主数据的写入规则。编辑、归档与恢复共用同一套判断与文案。
 *
 * 这一层是唯一性的**最终保护**。`institutions.normalized_name` 上没有 UNIQUE
 * 约束：migration 1 刻意只建普通索引，因为 ADR-014 与 PRD 第 5A.2 节写明
 * 「同名机构允许并存，不自动合并」，而且历史数据里可能已经存在重复行。
 * 因此这些检查必须与随后的写入处在**同一个独占事务**内
 * （`withExclusiveTransactionAsync`）：事务期间没有别的写入能插进来，
 * 查重与写入之间不存在竞态窗口。
 */

/** 页面数据已经过时时的统一收尾建议：不说原因细节，只给一条能走的路。 */
export const REFRESH_HINT = '请返回重新打开这个机构后再试';

export const MISSING_MESSAGE = '找不到这个机构，它可能已经不存在了';

/** 机构状态在操作期间被改动时的提示。不覆盖未知的新状态，让用户重新看一眼。 */
export const STALE_MESSAGE = `这个机构刚刚有变化，${REFRESH_HINT}`;

/** 选填字段的统一清洗：去首尾空格，空串视为没填。 */
export function normalizeOptionalText(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 校验并归一化机构名称。
 *
 * 大小写、首尾空格、词间多余空格与全角空格都会被 `normalizeInstitutionName`
 * 折叠掉，因此「 美研 」「美　研」「Meiyan」与「meiyan」不会绕过判重
 * （`\s` 覆盖半角空格、制表符与 U+3000 全角空格）。
 */
export function prepareInstitutionName(raw: string): {
  readonly name: string;
  readonly normalizedName: string;
} {
  const name = cleanInstitutionName(raw);
  if (name === '') {
    throw new InstitutionServiceError('请填写机构名称');
  }
  return { name, normalizedName: normalizeInstitutionName(name) };
}

/**
 * 判重命中时的说法。
 *
 * 两种冲突给两种话：撞上使用中的机构只能换个名字；撞上已归档的机构
 * 还可以选择去把那一条恢复过来，接着用它。
 *
 * 文案里不出现 UNIQUE、约束、表名或 SQL（任务书第八、十四节）。
 */
export function conflictMessage(conflict: InstitutionConflictRow): string {
  if (conflict.is_archived === 1) {
    return `已归档的机构里已经有一个叫「${conflict.name}」。可以改用别的名称，或者去「已归档」里恢复那一个。`;
  }
  return `已经有一个机构叫「${conflict.name}」。换一个名称，或者直接在套餐与核销里选用那一个。`;
}
