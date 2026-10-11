import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  BusinessDateField,
  Button,
  FormScreen,
  InlineNotice,
  ProvinceCityField,
  TextField,
} from '@/components/ui';
import type { InstitutionOption } from '@/db';
import type { PersonPickerOption, PersonPickerValue } from '@/features/people/components/person-picker';
import { usePersonOptions } from '@/features/people/hooks/use-person-options';
import { InstitutionPicker } from '@/features/purchases/components/institution-picker';
import { useInstitutionOptions } from '@/features/purchases/hooks/use-institution-options';
import { createInitialDraft, type PurchaseDraft } from '@/features/purchases/purchase-draft';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';
import { toUserMessage } from '@/features/purchases/services/errors';
import { useDataAccess } from '@/hooks/use-data-access';
import { Colors, Layout, TextStyles } from '@/theme';
import { todayBusinessDate } from '@/utils/business-date';
import { formatMinorAsYuan } from '@/utils/money';
import { createUuid } from '@/utils/uuid';
import { ChoiceModal, type ChoiceOption } from '../components/choice-modal';
import { UsageLineCard } from '../components/usage-line-card';
import {
  candidateMatches,
  changeLineService,
  changeLineSource,
  collectDateConfirmations,
  createEmptyLine,
  createInitialEventDraft,
  draftDatedSources,
  isEventDraftDirty,
  validateEventDraft,
  type EventDraft,
  type EventFormErrors,
  matchingNewPackageItemKeys,
  type UsageLineDraft,
  type UsageSourceMode,
} from '../event-draft';
import { useUsageSourceCandidates } from '../hooks/use-usage-source-candidates';
import {
  discardPackageHandoffs,
  openPackageHandoff,
  takeCompletedPackages,
} from '../new-package-handoff';
import { createBeautyEvent, MAX_USAGE_LINES, type CreateBeautyEventInput } from '../services/create-beauty-event';
import type { UsageSourceCandidate } from '../services/list-usage-source-candidates';
import { selectionDisplayName } from '../services/usage-snapshots';

/**
 * 记录一次变美（全屏表单，覆盖 Tab 栏；BT-0023，PRD 第 5B.3 节）。
 *
 * 外层只负责读好使用人与可用套餐，再挂载表单：「自己」的 ID 来自库里，初始草稿只算一次，
 * 「有没有改动」的比较基准才稳定。路由参数 `purchaseItemId`（来自套餐详情的项目行）
 * 预选为第一行的来源；那个项目已经没有余次时不预选，并说明原因。
 */
export function NewBeautyEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purchaseItemId?: string }>();
  const people = usePersonOptions();
  const sources = useUsageSourceCandidates();

  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  if (people.status === 'loading' || sources.status === 'loading') {
    return (
      <FormScreen title="记录一次变美" onCancel={cancel} footer={null}>
        <Text style={styles.placeholder}>正在准备表单…</Text>
      </FormScreen>
    );
  }

  if (people.result === null) {
    return (
      <FormScreen title="记录一次变美" onCancel={cancel} footer={null}>
        <InlineNotice
          tone="warning"
          message="没能读取使用人，暂时无法记录。"
          actionLabel="重试"
          onActionPress={people.reload}
        />
      </FormScreen>
    );
  }

  const requested = params.purchaseItemId ?? null;
  const preselected =
    requested === null ? null : (sources.candidates.find((c) => c.purchaseItemId === requested) ?? null);

  return (
    <BeautyEventForm
      self={{ id: people.result.selfId, name: people.result.selfName, isArchived: false }}
      personOptions={people.result.options}
      candidates={sources.candidates}
      candidatesFailed={sources.status === 'error'}
      onReloadCandidates={sources.reload}
      preselected={preselected}
      preselectMissing={requested !== null && preselected === null && sources.status === 'ready'}
    />
  );
}

type BeautyEventFormProps = {
  readonly self: PersonPickerValue;
  readonly personOptions: readonly PersonPickerOption[];
  readonly candidates: readonly UsageSourceCandidate[];
  readonly candidatesFailed: boolean;
  readonly onReloadCandidates: () => void;
  readonly preselected: UsageSourceCandidate | null;
  /** 带着项目进来，但那个项目已经没有余次（或已不存在） */
  readonly preselectMissing: boolean;
};

/** 弹层的打开状态：为哪一行选已有套餐，或为哪一行选新套餐中的项目。 */
type ModalState =
  | { readonly kind: 'candidate'; readonly lineKey: string }
  | { readonly kind: 'newPackageItem'; readonly lineKey: string }
  | null;

function candidateDetail(candidate: UsageSourceCandidate): string {
  return [
    candidate.purchaseName,
    `剩余 ${candidate.remaining} 次`,
    candidate.expiresOn === null ? null : `有效期至 ${candidate.expiresOn}`,
    candidate.institutionName,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function BeautyEventForm({
  self,
  personOptions,
  candidates,
  candidatesFailed,
  onReloadCandidates,
  preselected,
  preselectMissing,
}: BeautyEventFormProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();
  const institutions = useInstitutionOptions();

  // 初始草稿只算一次；全部客户端 ID 在这里一次性生成，重复提交带的是同一组 ID（幂等）。
  const [initialDraft] = useState(() =>
    createInitialEventDraft(todayBusinessDate(), createUuid, self, preselected),
  );
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [errors, setErrors] = useState<EventFormErrors | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedEventId, setSavedEventId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  /** 选择已有套餐时是否也列出单次购买；每次打开弹层都回到默认的「只看套餐」（PRD 第 5B.8 节）。 */
  const [showSingles, setShowSingles] = useState(false);

  /** 提交闸门。放在 ref 里，同一帧内的第二次点击就能被挡住。 */
  const submitting = useRef(false);
  const mounted = useRef(true);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const eventId = initialDraft.eventId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // 离开记录表单时清掉它发起的全部新套餐交接；什么也不会写进数据库。
      discardPackageHandoffs(eventId);
    };
  }, [eventId]);

  /** 从「新建套餐并使用」子步骤回来：取走确认过的新套餐，挂到对应的那一行。 */
  useFocusEffect(
    useCallback(() => {
      const completed = takeCompletedPackages(eventId);
      if (completed.length === 0) {
        return;
      }
      setDraft((previous) => ({
        ...previous,
        lines: previous.lines.map((line) => {
          const result = completed.find((entry) => entry.lineKey === line.key);
          if (result === undefined) {
            return line;
          }
          // 子步骤保证套餐里保留了与这一行项目匹配的项目；这里只在匹配项中挑：原来选的仍在就沿用，否则取第一个。
          const keys = line.service === null ? [] : matchingNewPackageItemKeys(line.service, result.draft);
          const keptKey =
            line.newPackageItemKey !== null && keys.includes(line.newPackageItemKey)
              ? line.newPackageItemKey
              : (keys[0] ?? null);
          return {
            ...line,
            mode: 'new_package',
            candidate: null,
            newPackage: { purchaseId: result.purchaseId, draft: result.draft, input: result.input },
            newPackageItemKey: keptKey,
          };
        }),
      }));
    }, [eventId]),
  );

  const preventRemove = isEventDraftDirty(draft, initialDraft) && savedEventId === null && !saving;
  usePreventRemove(preventRemove, ({ data }) => {
    Alert.alert('放弃这次记录？', '已经填写的内容不会被保存。', [
      { text: '继续填写', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  /** 保存成功后进入这条变美记录的详情；放在 effect 里，等返回拦截解除后再导航。 */
  useEffect(() => {
    if (savedEventId === null) {
      return;
    }
    const detail = { pathname: '/(tabs)/records/event/[eventId]' as const, params: { eventId: savedEventId } };
    if (router.canDismiss()) {
      router.dismissTo(detail);
    } else {
      router.replace(detail);
    }
  }, [savedEventId, router]);

  const updateDraft = useCallback((patch: Partial<EventDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  const updateLine = useCallback((key: string, patch: Partial<UsageLineDraft>) => {
    setDraft((previous) => ({
      ...previous,
      lines: previous.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }, []);

  const addLine = useCallback(() => {
    setDraft((previous) =>
      previous.lines.length >= MAX_USAGE_LINES
        ? previous
        : { ...previous, lines: [...previous.lines, createEmptyLine(createUuid, self)] },
    );
  }, [self]);

  const removeLine = useCallback((key: string) => {
    setDraft((previous) => ({ ...previous, lines: previous.lines.filter((line) => line.key !== key) }));
  }, []);

  const selectInstitution = useCallback((option: InstitutionOption) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'existing',
      institutionId: option.id,
      institutionQuery: option.name,
    }));
  }, []);

  const changeInstitutionQuery = useCallback((query: string) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: query.trim() === '' ? 'none' : 'new',
      institutionId: null,
      institutionQuery: query,
    }));
  }, []);

  const clearInstitution = useCallback(() => {
    setDraft((previous) => ({ ...previous, institutionMode: 'none', institutionId: null, institutionQuery: '' }));
  }, []);

  const changeService = useCallback((key: string, service: PurchaseItemIdentity) => {
    setDraft((previous) => ({
      ...previous,
      lines: previous.lines.map((line) =>
        line.key === key ? changeLineService(line, service, selectionDisplayName(service)) : line,
      ),
    }));
  }, []);

  const changeSource = useCallback(
    (key: string, mode: UsageSourceMode) => {
      setDraft((previous) => ({
        ...previous,
        lines: previous.lines.map((line) => (line.key === key ? changeLineSource(line, mode, self) : line)),
      }));
    },
    [self],
  );

  /**
   * 打开「新建套餐并使用」：第一次打开时以记录的日期、机构与这一行的项目作为新套餐的初值
   * （预置一个项目，名称取项目名称），再次打开时带回上次的草稿。
   */
  const openNewPackage = useCallback(
    (line: UsageLineDraft) => {
      if (submitting.current || line.service === null) {
        return;
      }
      const service = line.service;
      const current = draftRef.current;
      const purchaseId = line.newPackage?.purchaseId ?? createUuid();
      let initial: PurchaseDraft;
      if (line.newPackage !== null) {
        initial = line.newPackage.draft;
      } else {
        const blank = createInitialDraft(current.occurredOn, createUuid(), self);
        initial = {
          ...blank,
          items: blank.items.map((item) => ({ ...item, service, name: line.serviceName })),
          institutionMode: current.institutionMode,
          institutionId: current.institutionId,
          institutionQuery: current.institutionQuery,
          newInstitutionLocation: current.newInstitutionLocation,
        };
      }
      openPackageHandoff(purchaseId, {
        eventId,
        lineKey: line.key,
        initial,
        requiredService: service,
        requiredName: line.serviceName,
      });
      router.push({ pathname: '/event/new-package', params: { purchaseId } });
    },
    [eventId, router, self],
  );

  const save = useCallback(
    async (input: CreateBeautyEventInput) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await createBeautyEvent(dataAccess, input);
        if (!mounted.current) {
          return;
        }
        // 不复位闸门：页面即将离开。
        setSavedEventId(result.eventId);
      } catch (error) {
        const message = toUserMessage(error, '没能保存这次记录，请重试。你填写的内容都还在。');
        submitting.current = false;
        if (!mounted.current) {
          return;
        }
        setSaveError(message);
        setSaving(false);
      }
    },
    [dataAccess],
  );

  const handleSubmit = useCallback(() => {
    if (submitting.current) {
      return;
    }
    const current = draftRef.current;
    const result = validateEventDraft(current);
    if (!result.ok) {
      setErrors(result.errors);
      setSaveError('还有几处需要修改，请检查下方标红的内容。');
      return;
    }

    // 同一个已有项目被几行使用时，先按页面上读到的余次提醒一次；最终以保存时事务内的结果为准。
    const demand = new Map<string, { candidate: UsageSourceCandidate; count: number; keys: string[] }>();
    for (const line of current.lines) {
      if (line.mode === 'package' && line.candidate !== null) {
        const entry = demand.get(line.candidate.purchaseItemId) ?? { candidate: line.candidate, count: 0, keys: [] };
        entry.count += 1;
        entry.keys.push(line.key);
        demand.set(line.candidate.purchaseItemId, entry);
      }
    }
    const overused: Record<string, { source: string }> = {};
    for (const { candidate, count, keys } of demand.values()) {
      if (count > candidate.remaining) {
        for (const key of keys) {
          overused[key] = { source: `「${candidate.itemName}」只剩 ${candidate.remaining} 次，这次记录用了 ${count} 次` };
        }
      }
    }
    if (Object.keys(overused).length > 0) {
      setErrors({ lines: overused });
      setSaveError('有套餐的剩余次数不够，请换一个来源或减少使用次数。');
      return;
    }

    setErrors(null);
    setSaveError(null);

    const confirmations = collectDateConfirmations(result.input.occurredOn, draftDatedSources(current));
    const confirmFrom = (index: number): void => {
      const pending = confirmations[index];
      if (pending === undefined) {
        void save(result.input);
        return;
      }
      Alert.alert(pending.title, pending.body, [
        { text: '返回检查', style: 'cancel' },
        { text: '仍然记录', onPress: () => confirmFrom(index + 1) },
      ]);
    };
    confirmFrom(0);
  }, [save]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const modalLine = modal === null ? null : (draft.lines.find((line) => line.key === modal.lineKey) ?? null);

  // 单次购买默认不出现在可用套餐中；它唯一的使用被撤销后，可以打开「也显示单次购买」找到并再次使用
  // （PRD 第 5B.8 节、PRD-EVT-005）。当前已选中的单次购买照常列出，不被藏起来。
  const currentCandidateId = modal?.kind === 'candidate' ? (modalLine?.candidate?.purchaseItemId ?? null) : null;
  const modalService = modal?.kind === 'candidate' ? (modalLine?.service ?? null) : null;
  const matchingSingles =
    modalService === null
      ? 0
      : candidates.filter((c) => c.purchaseKind === 'single' && candidateMatches(modalService, c)).length;
  const candidateOptions = useMemo<ChoiceOption[]>(
    () =>
      candidates
        // 只列与这一行项目是同一个项目的购买项目（DATA_MODEL_V4 第 5.5 节的兼容规则）；保存时 service 再校验一次。
        .filter((candidate) => modalService !== null && candidateMatches(modalService, candidate))
        .filter(
          (candidate) =>
            candidate.purchaseKind === 'package' || showSingles || candidate.purchaseItemId === currentCandidateId,
        )
        .map((candidate) => ({
        key: candidate.purchaseItemId,
        title: candidate.itemName,
        detail: candidateDetail(candidate),
        tag: candidate.purchaseKind === 'single' ? '单次' : undefined,
      })),
    [candidates, showSingles, currentCandidateId, modalService],
  );

  const newPackageItemOptions = useMemo<ChoiceOption[]>(() => {
    const pkg = modalLine?.newPackage;
    if (pkg === undefined || pkg === null) {
      return [];
    }
    const service = modalLine?.service ?? null;
    const matching = service === null ? [] : matchingNewPackageItemKeys(service, pkg.draft);
    return pkg.draft.items.flatMap((item, index) => {
      if (!matching.includes(item.key)) {
        return [];
      }
      const input = pkg.input.items[index];
      return [
        {
          key: item.key,
          title: item.name,
          detail:
            input === undefined
              ? undefined
              : `购买 ${input.quantity} 次 · 分配 ${formatMinorAsYuan(input.allocatedAmountMinor)}`,
        },
      ];
    });
  }, [modalLine]);

  return (
    <FormScreen
      title="记录一次变美"
      subtitle="一次到店做了几个项目，就记几条"
      onCancel={handleCancel}
      footer={
        <Button
          label={saving ? '正在保存…' : '保存记录'}
          variant="primary"
          loading={saving}
          onPress={handleSubmit}
          accessibilityLabel="保存记录"
        />
      }
    >
      {saveError ? <InlineNotice tone="warning" message={saveError} /> : null}
      {preselectMissing ? (
        <InlineNotice tone="neutral" message="这个项目已经没有剩余次数，请换一个来源。" />
      ) : null}
      {candidatesFailed ? (
        <InlineNotice
          tone="warning"
          message="没能读取可用套餐，「使用已有套餐」暂时无法选择；其他来源不受影响。"
          actionLabel="重试"
          onActionPress={onReloadCandidates}
        />
      ) : null}

      <View style={styles.section}>
        <BusinessDateField
          label="日期"
          required
          value={draft.occurredOn}
          onChange={(value) => updateDraft({ occurredOn: value })}
          helperText="默认今天，可以补录以前的日期"
          error={errors?.occurredOn}
          disabled={saving}
        />

        <InstitutionPicker
          options={institutions}
          mode={draft.institutionMode}
          institutionId={draft.institutionId}
          query={draft.institutionQuery}
          error={errors?.institution}
          onQueryChange={changeInstitutionQuery}
          onSelectExisting={selectInstitution}
          onClear={clearInstitution}
          disabled={saving}
        />

        {/* 地点跟随机构，不单独选择；只有当场新增机构时才填新机构的地点（DATA_MODEL_V4 第 4.5 节）。 */}
        {draft.institutionMode === 'new' ? (
          <ProvinceCityField
            label="新机构地点"
            value={draft.newInstitutionLocation}
            onChange={(value) => updateDraft({ newInstitutionLocation: value })}
            clearable
            disabled={saving}
            helperText="选填。只在新建这家机构时保存；若已有同名机构，会直接使用它原来的地点。"
          />
        ) : (
          <Text style={styles.hint}>地点跟随所选机构，不需要单独填写。</Text>
        )}

        <TextField
          label="这次的备注"
          value={draft.notes}
          onChangeText={(value) => updateDraft({ notes: value })}
          placeholder="例如 和朋友一起去的"
          multiline
          editable={!saving}
        />
      </View>

      {draft.lines.map((line, index) => (
        <UsageLineCard
          key={line.key}
          line={line}
          index={index + 1}
          canRemove={draft.lines.length > 1}
          errors={errors?.lines[line.key]}
          personOptions={personOptions}
          matchingCandidateCount={
            line.service === null
              ? 0
              : candidates.filter((c) => line.service !== null && candidateMatches(line.service, c)).length
          }
          disabled={saving}
          onChangeService={(service) => changeService(line.key, service)}
          onChangeSource={(mode) => changeSource(line.key, mode)}
          onChange={(patch) => updateLine(line.key, patch)}
          onRemove={() => removeLine(line.key)}
          onChooseCandidate={() => {
            setShowSingles(false);
            setModal({ kind: 'candidate', lineKey: line.key });
          }}
          onOpenNewPackage={() => openNewPackage(line)}
          onChooseNewPackageItem={() => setModal({ kind: 'newPackageItem', lineKey: line.key })}
        />
      ))}

      <Button
        label="再记一个项目"
        icon="plus"
        onPress={addLine}
        disabled={saving || draft.lines.length >= MAX_USAGE_LINES}
        disabledReason={draft.lines.length >= MAX_USAGE_LINES ? `一次最多记录 ${MAX_USAGE_LINES} 个项目` : undefined}
      />

      <ChoiceModal
        visible={modal?.kind === 'candidate'}
        title="选择要使用的套餐"
        subtitle="只列出仍有剩余次数的项目。已过有效期的套餐仍可使用，保存前会提醒。"
        options={candidateOptions}
        initialKey={modalLine?.candidate?.purchaseItemId ?? null}
        confirmLabel="使用这个套餐"
        emptyText="没有与这个项目匹配且仍有余次的套餐项目。你可以改选项目，或选择其他来源。"
        toggle={
          matchingSingles === 0
            ? undefined
            : {
                label: showSingles ? '只看套餐' : `也显示单次购买（${matchingSingles}）`,
                onPress: () => setShowSingles((previous) => !previous),
              }
        }
        onCancel={() => setModal(null)}
        onConfirm={(key) => {
          const candidate = candidates.find((c) => c.purchaseItemId === key) ?? null;
          if (modal !== null) {
            updateLine(modal.lineKey, { candidate });
          }
          setModal(null);
        }}
      />

      <ChoiceModal
        visible={modal?.kind === 'newPackageItem'}
        title="这次用的是新套餐里的哪一项"
        subtitle="只列出与这个项目相同的项目。"
        options={newPackageItemOptions}
        initialKey={modalLine?.newPackageItemKey ?? null}
        confirmLabel="使用这个项目"
        emptyText="新套餐里还没有项目，请先修改新套餐。"
        onCancel={() => setModal(null)}
        onConfirm={(key) => {
          if (modal !== null) {
            updateLine(modal.lineKey, { newPackageItemKey: key });
          }
          setModal(null);
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  section: {
    gap: Layout.fieldGap,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
