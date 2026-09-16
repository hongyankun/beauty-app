import { compareBusinessDates, parseBusinessDate } from '@/utils/business-date';
import { cleanInstitutionName } from '@/utils/institution-name';
import type { InstitutionDraftMode } from './purchase-draft';
import type { CreateRedemptionInput } from './services/create-redemption';
import type { InstitutionSelection } from './services/institution-selection';
import type { RedemptionTarget } from './services/get-redemption-target';

/**
 * 新增核销表单的草稿模型与校验。
 *
 * 与 `purchase-draft` 一样是**纯函数**：不碰 React、不碰数据库、不碰导航，
 * 这样「日期怎么算过期」这类规则可以脱离界面单独推敲。
 */

export type RedemptionDraft = {
  readonly redeemedOn: string;
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  readonly city: string;
  readonly notes: string;
};

export type RedemptionFormErrors = {
  readonly redeemedOn?: string;
  readonly institution?: string;
};

export type RedemptionDraftValidation =
  | { readonly ok: true; readonly input: CreateRedemptionInput }
  | { readonly ok: false; readonly errors: RedemptionFormErrors };

const DATE_MESSAGES = {
  empty: '请填写核销日期',
  malformed: '请按 YYYY-MM-DD 填写，例如 2026-09-15',
  not_a_real_date: '这一天在日历上不存在，请检查月份与日期',
  out_of_range: '年份超出可填写范围',
} as const;

/**
 * 初始草稿：日期默认今天，机构与城市默认继承套餐（PRD-RED-003）。
 *
 * 继承的是套餐的机构**实体**，不是名称文本：这样用户不改机构时，
 * 核销会复用同一条机构记录，而不是按名字重新建一个。
 */
export function createInitialRedemptionDraft(
  target: RedemptionTarget,
  today: string,
): RedemptionDraft {
  const hasInstitution = target.institutionId !== null;
  return {
    redeemedOn: today,
    institutionMode: hasInstitution ? 'existing' : 'none',
    institutionId: target.institutionId,
    institutionQuery: hasInstitution ? (target.institutionName ?? '') : '',
    city: target.city ?? '',
    notes: '',
  };
}

function toInstitutionSelection(draft: RedemptionDraft): InstitutionSelection {
  if (draft.institutionMode === 'existing' && draft.institutionId !== null) {
    return { kind: 'existing', institutionId: draft.institutionId };
  }
  if (draft.institutionMode === 'new') {
    return { kind: 'new', name: cleanInstitutionName(draft.institutionQuery) };
  }
  return { kind: 'none' };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** 校验整份草稿，一次性收集全部错误再返回。 */
export function validateRedemptionDraft(
  draft: RedemptionDraft,
  purchaseItemId: string,
): RedemptionDraftValidation {
  let redeemedOnError: string | undefined;
  let institutionError: string | undefined;

  const redeemedOn = parseBusinessDate(draft.redeemedOn);
  if (!redeemedOn.ok) {
    redeemedOnError = DATE_MESSAGES[redeemedOn.reason];
  }

  const selection = toInstitutionSelection(draft);
  if (selection.kind === 'new' && selection.name === '') {
    institutionError = '机构名称不能只有空格';
  }

  if (!redeemedOn.ok || institutionError !== undefined) {
    return { ok: false, errors: { redeemedOn: redeemedOnError, institution: institutionError } };
  }

  return {
    ok: true,
    input: {
      purchaseItemId,
      redeemedOn: redeemedOn.value,
      institution: selection,
      city: optionalText(draft.city),
      notes: optionalText(draft.notes),
    },
  };
}

/**
 * 这次核销是否需要过期提醒（ADR-017、任务书第十节）。
 *
 * 判断的是**核销日期是否晚于有效期**，不是「今天是否已经过了有效期」：
 * 一张今天看来已过期的套餐，补录一次有效期之内的核销是完全正常的，
 * 那种情况不该打扰用户。有效期为空表示未知或长期有效，不参与判断（E-10）。
 */
export function isRedeemedAfterExpiry(
  redeemedOn: string,
  expiresOn: string | null,
): boolean {
  if (expiresOn === null) {
    return false;
  }
  return compareBusinessDates(redeemedOn, expiresOn) > 0;
}

/**
 * 这次核销是否需要「早于购买日期」提醒（PRD-RED-009、E-15）。
 *
 * 补录与转卡都可能产生早于购买日期的核销，所以这只是一次确认，不是拦截。
 * 与购买日期同一天不提醒——那天买那天做是最常见的情况。
 */
export function isRedeemedBeforePurchase(
  redeemedOn: string,
  purchaseDate: string,
): boolean {
  return compareBusinessDates(redeemedOn, purchaseDate) < 0;
}

/** 草稿相对初始状态是否已有改动，用来决定返回时要不要弹放弃确认。 */
export function isRedemptionDraftDirty(
  draft: RedemptionDraft,
  initial: RedemptionDraft,
): boolean {
  return (
    draft.redeemedOn !== initial.redeemedOn ||
    draft.institutionMode !== initial.institutionMode ||
    draft.institutionId !== initial.institutionId ||
    draft.institutionQuery !== initial.institutionQuery ||
    draft.city !== initial.city ||
    draft.notes !== initial.notes
  );
}
