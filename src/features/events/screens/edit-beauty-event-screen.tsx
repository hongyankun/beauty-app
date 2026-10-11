import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { InstitutionPicker } from '@/features/purchases/components/institution-picker';
import { useInstitutionOptions } from '@/features/purchases/hooks/use-institution-options';
import type { InstitutionDraftMode } from '@/features/purchases/purchase-draft';
import { toUserMessage } from '@/features/purchases/services/errors';
import type { ProvinceCitySelection } from '@/data/administrative-divisions';
import { useDataAccess } from '@/hooks/use-data-access';
import { Colors, Layout, TextStyles } from '@/theme';
import { parseBusinessDate } from '@/utils/business-date';
import { collectDateConfirmations, eventInstitutionSelection } from '../event-draft';
import { getBeautyEventDetail, type BeautyEventDetail } from '../services/get-beauty-event-detail';
import { updateBeautyEvent } from '../services/update-beauty-event';

/**
 * 编辑变美记录（全屏表单，覆盖 Tab 栏；BT-0023 裁决 4）。
 *
 * 只能改日期、机构与这次的备注。机构不变时名称与地点快照逐字段保留；改选机构时按新机构
 * 此刻的名称与地点重新复制。每一条使用记录的使用人、项目与备注都不在这一页：
 * 它们保存后不能直接修改，记错了请在详情页撤销那一条再重新记录。
 */
export function EditBeautyEventScreen() {
  const router = useRouter();
  const dataAccess = useDataAccess();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; detail: BeautyEventDetail }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const detail = await getBeautyEventDetail(dataAccess, eventId);
        if (active) {
          setState(detail === null ? { status: 'missing' } : { status: 'ready', detail });
        }
      } catch (error) {
        if (active) {
          if (__DEV__) {
            console.error('[events] 读取变美记录失败', error instanceof Error ? error.name : typeof error);
          }
          setState({ status: 'error' });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [dataAccess, eventId, attempt]);

  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  if (state.status === 'ready') {
    return <EditBeautyEventForm detail={state.detail} />;
  }
  return (
    <FormScreen title="编辑这次记录" onCancel={cancel} footer={null}>
      {state.status === 'loading' ? <Text style={styles.hint}>正在载入…</Text> : null}
      {state.status === 'missing' ? (
        <InlineNotice tone="warning" message="找不到这条变美记录，它可能已经被删除了。" actionLabel="返回" onActionPress={cancel} />
      ) : null}
      {state.status === 'error' ? (
        <InlineNotice
          tone="warning"
          message="没能读取这条变美记录。"
          actionLabel="重试"
          onActionPress={() => {
            setState({ status: 'loading' });
            setAttempt((previous) => previous + 1);
          }}
        />
      ) : null}
    </FormScreen>
  );
}

type EditDraft = {
  readonly occurredOn: string;
  readonly institutionMode: InstitutionDraftMode;
  readonly institutionId: string | null;
  readonly institutionQuery: string;
  readonly newInstitutionLocation: ProvinceCitySelection | null;
  readonly notes: string;
};

function EditBeautyEventForm({ detail }: { readonly detail: BeautyEventDetail }) {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();
  const institutions = useInstitutionOptions();

  const [initialDraft] = useState<EditDraft>(() => ({
    occurredOn: detail.occurredOn,
    institutionMode: detail.institutionId === null ? 'none' : 'existing',
    institutionId: detail.institutionId,
    institutionQuery: detail.institutionId === null ? '' : (detail.institutionName ?? ''),
    newInstitutionLocation: null,
    notes: detail.notes ?? '',
  }));
  const [draft, setDraft] = useState<EditDraft>(initialDraft);
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  usePreventRemove(dirty && !saved && !saving, ({ data }) => {
    Alert.alert('放弃这次修改？', '修改的内容不会被保存。', [
      { text: '继续修改', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (saved) {
      router.back();
    }
  }, [saved, router]);

  const update = useCallback((patch: Partial<EditDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  const save = useCallback(
    async (occurredOn: string) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        await updateBeautyEvent(dataAccess, {
          eventId: detail.id,
          occurredOn,
          institution: eventInstitutionSelection(draft),
          notes: draft.notes,
        });
        if (mounted.current) {
          setSaved(true);
        }
      } catch (error) {
        const message = toUserMessage(error, '没能保存修改，请重试。你填写的内容都还在。');
        submitting.current = false;
        if (mounted.current) {
          setSaveError(message);
          setSaving(false);
        }
      }
    },
    [dataAccess, detail.id, draft],
  );

  const handleSubmit = useCallback(() => {
    if (submitting.current) {
      return;
    }
    const parsed = parseBusinessDate(draft.occurredOn);
    if (!parsed.ok) {
      setDateError('请选择一个真实存在的日期');
      setSaveError('还有几处需要修改，请检查下方标红的内容。');
      return;
    }
    if (draft.institutionMode === 'new' && draft.institutionQuery.trim() === '') {
      setSaveError('机构名称不能只有空格');
      return;
    }
    setDateError(undefined);
    setSaveError(null);
    // 改了日期时，对仍关联套餐的有效记录按 ADR-017 提醒；只陈述日期事实，不阻止保存。
    const confirmations =
      parsed.value === detail.occurredOn
        ? []
        : collectDateConfirmations(
            parsed.value,
            detail.usages.flatMap((usage) =>
              !usage.isVoided && usage.purchaseDate !== null
                ? [{ name: usage.sourceLabel, purchaseDate: usage.purchaseDate, expiresOn: usage.expiresOn }]
                : [],
            ),
          );
    const confirmFrom = (index: number): void => {
      const pending = confirmations[index];
      if (pending === undefined) {
        void save(parsed.value);
        return;
      }
      Alert.alert(pending.title, pending.body, [
        { text: '返回检查', style: 'cancel' },
        { text: '仍然保存', onPress: () => confirmFrom(index + 1) },
      ]);
    };
    confirmFrom(0);
  }, [draft, detail, save]);

  const institutionChanged =
    draft.institutionMode !== initialDraft.institutionMode || draft.institutionId !== initialDraft.institutionId;

  return (
    <FormScreen
      title="编辑这次记录"
      subtitle="只能修改日期、机构和这次的备注"
      onCancel={() => router.back()}
      footer={
        <Button
          label={saving ? '正在保存…' : '保存修改'}
          variant="primary"
          loading={saving}
          onPress={handleSubmit}
          accessibilityLabel="保存修改"
        />
      }
    >
      {saveError ? <InlineNotice tone="warning" message={saveError} /> : null}
      {detail.institutionId === null && detail.institutionName !== null ? (
        <InlineNotice
          tone="neutral"
          message={`这次记录只保留了机构名称「${detail.institutionName}」。不选择机构时会原样保留。`}
        />
      ) : null}

      <View style={styles.section}>
        <BusinessDateField
          label="日期"
          required
          value={draft.occurredOn}
          onChange={(value) => update({ occurredOn: value })}
          error={dateError}
          disabled={saving}
        />

        <InstitutionPicker
          options={institutions}
          mode={draft.institutionMode}
          institutionId={draft.institutionId}
          query={draft.institutionQuery}
          onQueryChange={(query) =>
            update({ institutionMode: query.trim() === '' ? 'none' : 'new', institutionId: null, institutionQuery: query })
          }
          onSelectExisting={(option: InstitutionOption) =>
            update({ institutionMode: 'existing', institutionId: option.id, institutionQuery: option.name })
          }
          onClear={() => update({ institutionMode: 'none', institutionId: null, institutionQuery: '' })}
          disabled={saving}
        />

        {draft.institutionMode === 'new' ? (
          <ProvinceCityField
            label="新机构地点"
            value={draft.newInstitutionLocation}
            onChange={(value) => update({ newInstitutionLocation: value })}
            clearable
            disabled={saving}
            helperText="选填。只在新建这家机构时保存；若已有同名机构，会直接使用它原来的地点。"
          />
        ) : null}

        <Text style={styles.hint}>
          {institutionChanged
            ? '改选机构后，这次记录的机构名称与地点会按新机构现在的信息保存。'
            : `地点：${detail.locationLabel ?? '未记录'}。机构不变时，这次记录的机构名称与地点保持当时的样子。`}
        </Text>

        <TextField
          label="这次的备注"
          value={draft.notes}
          onChangeText={(value) => update({ notes: value })}
          multiline
          editable={!saving}
        />

        <Text style={styles.hint}>
          修改日期、机构与备注不会改变任何剩余次数。每个项目的使用人、项目与备注保存后不能直接修改，记错了请在详情页撤销那一条再重新记录。
        </Text>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.fieldGap,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
