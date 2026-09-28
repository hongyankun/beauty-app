import type { PersonConflictRow } from '@/db';
import { cleanInstitutionName, normalizeInstitutionName } from '@/utils/institution-name';
import { PersonServiceError } from './errors';

/**
 * 使用人主数据的写入规则。新增、改名、归档、恢复与删除共用同一套判断与文案。
 *
 * 判重键与机构、与迁移时生成「自己」用的是**同一个**归一化函数
 * （`normalizeInstitutionName`），否则新加一个「自己 」会绕过判重，
 * 撞上 `idx_people_profile_name` 唯一索引（PRD 第 5B.4 节）。
 * 这里的检查与写入处在同一个独占事务里；唯一索引是最后一道保护。
 */

export const REFRESH_HINT = '请返回重新打开后再试';

export const MISSING_MESSAGE = '找不到这个人，可能已经被删除了';

export const STALE_MESSAGE = `这个人的信息刚刚有变化，${REFRESH_HINT}`;

/** 「自己」受保护：不能改名、归档或删除（PRD-PERSON-001）。 */
export const SELF_PROTECTED_MESSAGE = '「自己」是固定的使用人，不能改名、归档或删除';

/** 被记录用过的人只能归档（PRD 第 5B.4 节）。 */
export const REFERENCED_MESSAGE =
  '这个人已经出现在套餐或使用记录里，不能删除。可以改为归档，归档后历史记录照常显示。';

/**
 * 校验并归一化人名。
 *
 * 大小写、首尾空格、词间多余空格与全角空格都会被折叠掉，
 * 「 妈妈 」「妈　妈」「Mom」与「mom」不会绕过判重。
 */
export function preparePersonName(raw: string): {
  readonly name: string;
  readonly normalizedName: string;
} {
  const name = cleanInstitutionName(raw);
  if (name === '') {
    throw new PersonServiceError('请填写名称');
  }
  return { name, normalizedName: normalizeInstitutionName(name) };
}

/** 判重命中时的说法。文案里不出现 UNIQUE、约束、表名或 SQL。 */
export function conflictMessage(conflict: PersonConflictRow): string {
  if (conflict.is_self === 1) {
    return `「${conflict.display_name}」是固定的使用人，换一个名称吧。`;
  }
  if (conflict.status === 'archived') {
    return `已归档的人里已经有一个叫「${conflict.display_name}」。可以改用别的名称，或者去「已归档」里恢复那一个。`;
  }
  return `已经有一个人叫「${conflict.display_name}」，换一个名称吧。`;
}
