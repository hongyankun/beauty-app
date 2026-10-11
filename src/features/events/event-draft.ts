import type { ProvinceCitySelection } from '@/data/administrative-divisions';
import type { PersonPickerValue } from '@/features/people/components/person-picker';
import type { InstitutionDraftMode, PurchaseDraft, PurchaseDraftInput } from '@/features/purchases/purchase-draft';
import { isRedeemedAfterExpiry, isRedeemedBeforePurchase } from '@/features/purchases/redemption-draft';
import type { InstitutionSelection } from '@/features/purchases/services/institution-selection';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';
import { parseBusinessDate } from '@/utils/business-date';
import { cleanInstitutionName } from '@/utils/institution-name';
import { parseYuanToMinor } from '@/utils/money';
import type { CreateBeautyEventInput, UsageLineInput } from './services/create-beauty-event';
import type { UsageSourceCandidate } from './services/list-usage-source-candidates';
import { identityMatchesItem } from './services/usage-snapshots';

/**
 * 「记录一次变美」的草稿模型与校验（BT-0023 / BT-0023B）。
 *
 * 纯函数：不碰 React、数据库与导航。草稿里的每个字段都是用户原样输入的值，
 * 只有通过 `validateEventDraft` 才会变成交给 service 的结构化输入。
 *
 * 页面整体顺序是「事件信息 → 本次项目」；每个项目的顺序是「项目 → 使用人 → 来源 → 来源详情」。
 * 来源依附于项目：项目没选时来源无法完成；换项目时与旧项目绑定的来源详情重新校验，
 * 换来源时清掉旧来源专属的字段（见 `changeLineService`、`changeLineSource`）。
 *
 * 全部客户端 ID（事件、每一行、单次购买与新套餐）在草稿创建时一次性生成并固定，
 * 同一份草稿重复提交带的永远是同一组 ID，service 据此做幂等判断。
 */

/** 每一行的来源；行上的 `mode` 为 null 表示还没有选。 */
export type UsageSourceMode = 'package' | 'new_package' | 'single' | 'external' | 'unlinked';

/** 「新建套餐并使用」挂在一行上的新套餐：子步骤交回的草稿与校验通过的输入。 */
export type AttachedNewPackage = {
  /** 新套餐的购买 ID，草稿创建时固定；项目 ID 就是各项目草稿的 key */
  readonly purchaseId: string;
  readonly draft: PurchaseDraft;
  readonly input: PurchaseDraftInput;
};

export type UsageLineDraft = {
  /** 同时是这条使用记录的 ID */
  readonly key: string;
  /** 做了什么项目；null 表示还没选 */
  readonly service: PurchaseItemIdentity | null;
  /** 项目的显示名称：目录项目取目录名称，自定义取自定义名称，从套餐项目带入时取它的名称 */
  readonly serviceName: string;
  readonly person: PersonPickerValue;
  readonly notes: string;
  readonly mode: UsageSourceMode | null;
  /** 使用已有套餐：选中的购买项目，必须与 `service` 是同一个项目 */
  readonly candidate: UsageSourceCandidate | null;
  /** 新建套餐并使用：子步骤交回的新套餐 */
  readonly newPackage: AttachedNewPackage | null;
  /** 新套餐中这次使用的项目（项目草稿的 key）；null 表示需要重新确认 */
  readonly newPackageItemKey: string | null;
  /** 本次单独购买的金额文本 */
  readonly amount: string;
  readonly purchaser: PersonPickerValue;
  /** 本次单独购买的购买与项目 ID，草稿创建时固定 */
  readonly singlePurchaseId: string;
  readonly singlePurchaseItemId: string;
};

export type EventDraft = {
  readonly eventId: string;
  readonly occurredOn: string;
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  readonly newInstitutionLocation: ProvinceCitySelection | null;
  readonly notes: string;
  readonly lines: readonly UsageLineDraft[];
};

export type UsageLineErrors = {
  readonly service?: string;
  readonly source?: string;
  readonly amount?: string;
};

export type EventFormErrors = {
  readonly occurredOn?: string;
  readonly institution?: string;
  readonly lines: Readonly<Record<string, UsageLineErrors>>;
};

export type EventDraftValidation =
  | { readonly ok: true; readonly input: CreateBeautyEventInput }
  | { readonly ok: false; readonly errors: EventFormErrors };

/** 生成新 ID 的函数由调用方注入，纯函数里不直接依赖随机数。 */
export type IdFactory = () => string;

export function createEmptyLine(newId: IdFactory, self: PersonPickerValue): UsageLineDraft {
  return {
    key: newId(),
    service: null,
    serviceName: '',
    person: self,
    notes: '',
    mode: null,
    candidate: null,
    newPackage: null,
    newPackageItemKey: null,
    amount: '',
    purchaser: self,
    singlePurchaseId: newId(),
    singlePurchaseItemId: newId(),
  };
}

/**
 * 初始草稿：日期默认今天，一行项目，使用人与购买人默认「自己」。
 * 从套餐详情带入一个项目时，这一行的项目就是那个套餐项目（原样继承它库里的身份），来源为「使用已有套餐」。
 */
export function createInitialEventDraft(
  today: string,
  newId: IdFactory,
  self: PersonPickerValue,
  preselected: UsageSourceCandidate | null,
): EventDraft {
  const first = createEmptyLine(newId, self);
  return {
    eventId: newId(),
    occurredOn: today,
    institutionMode: 'none',
    institutionId: null,
    institutionQuery: '',
    newInstitutionLocation: null,
    notes: '',
    lines: [
      preselected === null
        ? first
        : {
            ...first,
            service: preselected.identity,
            serviceName: preselected.itemName,
            mode: 'package',
            candidate: preselected,
          },
    ],
  };
}

export function isEventDraftDirty(draft: EventDraft, initial: EventDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(initial);
}

/** 候选购买项目是否与这一行的项目是同一个项目（DATA_MODEL_V4 第 5.5 节的兼容规则）。 */
export function candidateMatches(service: PurchaseItemIdentity, candidate: UsageSourceCandidate): boolean {
  return identityMatchesItem(service, {
    category_code: candidate.identity.categoryCode,
    service_code: candidate.identity.serviceCode,
    custom_name: candidate.identity.customName,
  });
}

/** 新套餐草稿里与这一行项目匹配的项目 key，按草稿顺序；没有时为空数组。 */
export function matchingNewPackageItemKeys(service: PurchaseItemIdentity, draft: PurchaseDraft): string[] {
  return draft.items
    .filter(
      (item) =>
        item.service !== null &&
        identityMatchesItem(service, {
          category_code: item.service.categoryCode,
          service_code: item.service.serviceCode,
          custom_name: item.service.customName,
        }),
    )
    .map((item) => item.key);
}

/**
 * 更换这一行的项目。
 *
 * - 使用人与来源类型保留；
 * - 已选的已有套餐项目与新项目不匹配时立即清除；
 * - 新套餐里仍有与新项目匹配的项目时沿用第一个匹配项，否则标记为需要重新确认（不静默沿用旧项目）；
 * - 本次单独购买、外部来源与暂不关联直接继承新项目。
 */
export function changeLineService(
  line: UsageLineDraft,
  service: PurchaseItemIdentity,
  serviceName: string,
): UsageLineDraft {
  const candidate = line.candidate !== null && candidateMatches(service, line.candidate) ? line.candidate : null;
  let newPackageItemKey: string | null = null;
  if (line.newPackage !== null) {
    const keys = matchingNewPackageItemKeys(service, line.newPackage.draft);
    newPackageItemKey =
      line.newPackageItemKey !== null && keys.includes(line.newPackageItemKey)
        ? line.newPackageItemKey
        : (keys[0] ?? null);
  }
  return { ...line, service, serviceName, candidate, newPackageItemKey };
}

/**
 * 更换这一行的来源。
 *
 * 项目与使用人保留；旧来源专属的字段全部清掉（已有套餐项目、新套餐草稿、单次金额与购买人），
 * 不把旧套餐项目 ID 带进新来源，也不把单次金额带进没有金额的来源。切回旧来源时从空白开始。
 * 来源相同时不变。
 */
export function changeLineSource(
  line: UsageLineDraft,
  mode: UsageSourceMode,
  self: PersonPickerValue,
): UsageLineDraft {
  if (line.mode === mode) {
    return line;
  }
  return {
    ...line,
    mode,
    candidate: null,
    newPackage: null,
    newPackageItemKey: null,
    amount: '',
    purchaser: self,
  };
}

const DATE_MESSAGES = {
  empty: '请选择日期',
  malformed: '请按 YYYY-MM-DD 填写，例如 2026-09-15',
  not_a_real_date: '这一天在日历上不存在，请检查月份与日期',
  out_of_range: '年份超出可填写范围',
} as const;

const AMOUNT_MESSAGES = {
  empty: '请填写本次花费，赠送或未收费填 0',
  not_a_number: '只能填写数字，例如 680 或 680.00',
  negative: '金额不能为负数',
  too_many_decimals: '最多保留两位小数',
  out_of_range: '金额过大，请检查是否输入有误',
} as const;

/** 事件机构的选择，与套餐、核销表单同一套三态。 */
export function eventInstitutionSelection(draft: {
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  readonly newInstitutionLocation: ProvinceCitySelection | null;
}): InstitutionSelection {
  if (draft.institutionMode === 'existing' && draft.institutionId !== null) {
    return { kind: 'existing', institutionId: draft.institutionId };
  }
  if (draft.institutionMode === 'new') {
    return {
      kind: 'new',
      name: cleanInstitutionName(draft.institutionQuery),
      location: draft.newInstitutionLocation,
    };
  }
  return { kind: 'none' };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 校验整份草稿，一次性收集全部字段的错误。
 *
 * 只校验字段自身与「来源和项目是否匹配」；余次、归属与项目是否仍在目录中由 service 在事务内最终判断。
 * 只有当前来源需要的字段会进入输入：隐藏的旧字段不会被提交。
 */
export function validateEventDraft(draft: EventDraft): EventDraftValidation {
  let occurredOnError: string | undefined;
  let institutionError: string | undefined;
  const lineErrors: Record<string, UsageLineErrors> = {};

  const occurredOn = parseBusinessDate(draft.occurredOn);
  if (!occurredOn.ok) {
    occurredOnError = DATE_MESSAGES[occurredOn.reason];
  }
  const institution = eventInstitutionSelection(draft);
  if (institution.kind === 'new' && institution.name === '') {
    institutionError = '机构名称不能只有空格';
  }

  const lines: UsageLineInput[] = [];
  const newPackages: CreateBeautyEventInput['newPackages'][number][] = [];
  for (const line of draft.lines) {
    const errors: { service?: string; source?: string; amount?: string } = {};
    const service = line.service;
    if (service === null) {
      errors.service = '请先选择项目';
    } else if (line.mode === null) {
      errors.source = '请选择来源';
    } else {
      const base = { usageId: line.key, service, personId: line.person.id, notes: optionalText(line.notes) };
      switch (line.mode) {
        case 'package':
          if (line.candidate === null) {
            errors.source = '请选择要使用的套餐，或换一种来源';
          } else if (!candidateMatches(service, line.candidate)) {
            errors.source = '选择的套餐项目与这个项目不一致，请重新选择';
          } else {
            lines.push({ ...base, source: { kind: 'purchase_item', purchaseItemId: line.candidate.purchaseItemId } });
          }
          break;
        case 'new_package': {
          const pkg = line.newPackage;
          if (pkg === null) {
            errors.source = '请新建要使用的套餐';
            break;
          }
          const itemIndex = pkg.draft.items.findIndex((item) => item.key === line.newPackageItemKey);
          const matches = matchingNewPackageItemKeys(service, pkg.draft);
          if (itemIndex < 0 || line.newPackageItemKey === null || !matches.includes(line.newPackageItemKey)) {
            errors.source = '新套餐里没有与这个项目匹配的项目，请修改新套餐';
            break;
          }
          lines.push({ ...base, source: { kind: 'new_package', purchaseId: pkg.purchaseId, itemIndex } });
          newPackages.push({
            ids: { purchaseId: pkg.purchaseId, itemIds: pkg.draft.items.map((item) => item.key) },
            purchase: pkg.input,
          });
          break;
        }
        case 'single': {
          const amount = parseYuanToMinor(line.amount);
          if (!amount.ok) {
            errors.amount = AMOUNT_MESSAGES[amount.reason];
          } else {
            lines.push({
              ...base,
              source: {
                kind: 'single_purchase',
                amountMinor: amount.minor,
                purchaserPersonId: line.purchaser.id,
                purchaseId: line.singlePurchaseId,
                purchaseItemId: line.singlePurchaseItemId,
              },
            });
          }
          break;
        }
        case 'external':
        case 'unlinked':
          lines.push({ ...base, source: { kind: line.mode } });
          break;
      }
    }
    if (Object.keys(errors).length > 0) {
      lineErrors[line.key] = errors;
    }
  }

  const hasError =
    occurredOnError !== undefined || institutionError !== undefined || Object.keys(lineErrors).length > 0;
  if (hasError || !occurredOn.ok) {
    return { ok: false, errors: { occurredOn: occurredOnError, institution: institutionError, lines: lineErrors } };
  }
  return {
    ok: true,
    input: {
      eventId: draft.eventId,
      occurredOn: occurredOn.value,
      institution,
      notes: optionalText(draft.notes),
      newPackages,
      lines,
    },
  };
}

/** 保存前需要用户确认的日期事实（PRD 第 7.2 节、ADR-017）。只陈述日期，不做任何医疗判断。 */
export type DateConfirmation = { readonly title: string; readonly body: string };

/**
 * 按「先购买日期、再有效期」的顺序列出需要确认的日期事实，每个套餐只提示一次。
 * 不阻止保存：确认后照常记录。
 */
export function collectDateConfirmations(
  occurredOn: string,
  sources: readonly { readonly name: string; readonly purchaseDate: string; readonly expiresOn: string | null }[],
): DateConfirmation[] {
  const seen = new Set<string>();
  const unique = sources.filter((source) => {
    const key = `${source.name}|${source.purchaseDate}|${source.expiresOn ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return [
    ...unique
      .filter((source) => isRedeemedBeforePurchase(occurredOn, source.purchaseDate))
      .map((source) => ({
        title: '这次记录的日期早于套餐购买日期，是否仍要记录？',
        body: `「${source.name}」购买日期为 ${source.purchaseDate}，这次记录的日期为 ${occurredOn}。`,
      })),
    ...unique
      .filter((source) => isRedeemedAfterExpiry(occurredOn, source.expiresOn))
      .map((source) => ({
        title: '这次记录的日期已超过套餐有效期，是否仍要记录？',
        body: `「${source.name}」有效期至 ${source.expiresOn ?? ''}，这次记录的日期为 ${occurredOn}。`,
      })),
  ];
}

/** 草稿里关联到套餐的来源（已有套餐与新建套餐），用于日期确认。 */
export function draftDatedSources(
  draft: EventDraft,
): { readonly name: string; readonly purchaseDate: string; readonly expiresOn: string | null }[] {
  return draft.lines.flatMap((line) => {
    if (line.mode === 'new_package' && line.newPackage !== null) {
      return [
        {
          name: line.newPackage.input.name,
          purchaseDate: line.newPackage.input.purchaseDate,
          expiresOn: line.newPackage.input.expiresOn,
        },
      ];
    }
    if (line.mode === 'package' && line.candidate !== null) {
      return [
        {
          name: line.candidate.purchaseName,
          purchaseDate: line.candidate.purchaseDate,
          expiresOn: line.candidate.expiresOn,
        },
      ];
    }
    return [];
  });
}
