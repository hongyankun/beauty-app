import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, FormScreen, InlineNotice, TextField } from '@/components/ui';
import type { InstitutionOption } from '@/db';
import { useDataAccess } from '@/hooks/use-data-access';
import { Colors, Layout, TextStyles } from '@/theme';
import { todayBusinessDate } from '@/utils/business-date';
import { InstitutionPicker } from '../components/institution-picker';
import { useInstitutionOptions } from '../hooks/use-institution-options';
import { useRedemptionTarget } from '../hooks/use-redemption-target';
import {
  createInitialRedemptionDraft,
  isRedeemedAfterExpiry,
  isRedeemedBeforePurchase,
  isRedemptionDraftDirty,
  validateRedemptionDraft,
  type RedemptionDraft,
  type RedemptionFormErrors,
} from '../redemption-draft';
import { createRedemption, type CreateRedemptionInput } from '../services/create-redemption';
import { toUserMessage } from '../services/errors';
import type { RedemptionTarget } from '../services/get-redemption-target';

/**
 * 记录一次核销（全屏表单，覆盖 Tab 栏）。
 *
 * 外层只负责把 `purchaseItemId` 换成一份真实的项目上下文；
 * 表单本身在 `RedemptionForm` 里，拿到 target 之后才挂载，
 * 这样「默认日期、默认机构」这些初始值只会被计算一次。
 */
export function NewRedemptionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purchaseItemId: string; purchaseId?: string }>();
  const { status, target, reload } = useRedemptionTarget(params.purchaseItemId);

  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  if (target === null) {
    if (status === 'loading') {
      return (
        <FormScreen title="记录一次核销" onCancel={cancel} footer={null}>
          <Text style={styles.placeholder}>正在载入项目信息…</Text>
        </FormScreen>
      );
    }
    return (
      <FormScreen title="记录一次核销" onCancel={cancel} footer={null}>
        {status === 'missing' ? (
          <InlineNotice
            tone="warning"
            message="找不到这个项目，它可能已经被删除了。"
            actionLabel="返回"
            onActionPress={cancel}
          />
        ) : (
          <InlineNotice
            tone="warning"
            message="没能读取这个项目。"
            actionLabel="重试"
            onActionPress={reload}
          />
        )}
      </FormScreen>
    );
  }

  return (
    <RedemptionForm
      target={target}
      refreshFailed={status === 'error'}
      returnPurchaseId={params.purchaseId ?? target.purchaseId}
      onRefreshTarget={reload}
    />
  );
}

type RedemptionFormProps = {
  target: RedemptionTarget;
  /** 最近一次刷新失败：下面显示的剩余次数可能不是最新的 */
  refreshFailed: boolean;
  /** 保存成功后要返回的套餐详情。路由参数优先，缺失时用项目自己所属的套餐兜底 */
  returnPurchaseId: string;
  onRefreshTarget: () => void;
};

function RedemptionForm({
  target,
  refreshFailed,
  returnPurchaseId,
  onRefreshTarget,
}: RedemptionFormProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();
  const institutions = useInstitutionOptions();

  // 初始草稿只算一次。刷新项目信息会换掉 target，但不该把用户已经改过的
  // 日期、机构与备注一起冲掉，也不该让「是否有改动」的基准跟着漂移。
  const [initialDraft] = useState(() => createInitialRedemptionDraft(target, todayBusinessDate()));
  const [draft, setDraft] = useState<RedemptionDraft>(initialDraft);
  const [errors, setErrors] = useState<RedemptionFormErrors | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住（PRD-RED-005）。 */
  const submitting = useRef(false);
  /**
   * 保存成功后允许直接离开，不再弹放弃确认。
   *
   * 必须是 state 而不是 ref：下面的拦截开关在**渲染期**读取，
   * 改一个 ref 不会让它重新计算。
   */
  const [saved, setSaved] = useState(false);

  /**
   * 拦截返回手势、Android 实体返回键与页面栈弹出（IA 第 4.3 节第 4 条）。
   *
   * 必须用 `usePreventRemove`，不能自己监听 `beforeRemove`：native-stack 的
   * iOS 侧滑由**原生侧**完成弹出，JS 里 `preventDefault()` 拦不回已经弹掉的页面，
   * 用户点「继续填写」仍会退出。这个 hook 会把「本页不允许被移除」同步给原生栈。
   */
  const preventRemove = isRedemptionDraftDirty(draft, initialDraft) && !saved && !saving;

  usePreventRemove(preventRemove, ({ data }) => {
    Alert.alert('放弃这次核销记录？', '已经填写的内容不会被保存。', [
      // 只关掉弹窗：不 dispatch 原返回 action，页面留在原处，输入原样保留。
      { text: '继续填写', style: 'cancel' },
      {
        // 只有用户明确选择放弃时，才把原来的返回动作补发一次。
        text: '放弃',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  const updateDraft = useCallback((patch: Partial<RedemptionDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  const handleSelectInstitution = useCallback((option: InstitutionOption) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'existing',
      institutionId: option.id,
      institutionQuery: option.name,
      city: previous.city.trim() === '' ? (option.city ?? '') : previous.city,
    }));
  }, []);

  const handleInstitutionQueryChange = useCallback((query: string) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: query.trim() === '' ? 'none' : 'new',
      institutionId: null,
      institutionQuery: query,
    }));
  }, []);

  const handleClearInstitution = useCallback(() => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'none',
      institutionId: null,
      institutionQuery: '',
    }));
  }, []);

  const save = useCallback(
    async (input: CreateRedemptionInput) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      setSaving(true);
      setSaveError(null);

      try {
        await createRedemption(dataAccess, input);
        setSaved(true);
      } catch (error) {
        setSaveError(toUserMessage(error, '没能保存这次核销，请重试。你填写的内容都还在。'));
        submitting.current = false;
        setSaving(false);
      }
    },
    [dataAccess],
  );

  /**
   * 保存成功后回到套餐详情，它在获得焦点时会重新读取余次。
   *
   * 放在 effect 里而不是异步回调里：`preventRemove` 是渲染期的值，
   * 在回调里紧接着导航时它还是 true，刚保存成功的用户会被问要不要放弃填写。
   */
  useEffect(() => {
    if (!saved) {
      return;
    }
    // 用 dismissTo 而不是 replace：replace 会把表单这一层换成第二份 Tab 导航。
    const detail = {
      pathname: '/(tabs)/records/[purchaseId]' as const,
      params: { purchaseId: returnPurchaseId },
    };
    if (router.canDismiss()) {
      router.dismissTo(detail);
    } else {
      router.replace(detail);
    }
  }, [saved, router, returnPurchaseId]);

  const handleSubmit = useCallback(() => {
    const result = validateRedemptionDraft(draft, target.purchaseItemId);
    if (!result.ok) {
      setErrors(result.errors);
      setSaveError('还有几处需要修改，请检查下方标红的内容。');
      return;
    }

    setErrors(null);
    setSaveError(null);

    // 保存前的确认按**套餐时间轴顺序**排队：先购买日期，再有效期。
    // 异常数据可能让两条同时成立（例如有效期早于购买日期的历史记录），
    // 那时两个确认会依次出现，缺一不可，用户中途选「返回检查」即全部中止。
    const { redeemedOn } = result.input;
    const confirmations: readonly { readonly title: string; readonly body: string }[] = [
      // 补录与转卡都可能早于购买日期，所以只确认、不拦截（PRD-RED-009、E-15）。
      ...(isRedeemedBeforePurchase(redeemedOn, target.purchaseDate)
        ? [
            {
              title: '核销日期早于购买日期，是否仍要记录？',
              body: `套餐购买日期为 ${target.purchaseDate}，本次核销日期为 ${redeemedOn}。`,
            },
          ]
        : []),
      // 比较的是核销日期与有效期，不是「今天是否已经过了有效期」：
      // 补录一次有效期之内的核销不该被打扰（ADR-017、E-16）。
      ...(isRedeemedAfterExpiry(redeemedOn, target.expiresOn)
        ? [
            {
              title: '本次核销日期已超过套餐有效期，是否仍要记录？',
              body: `套餐有效期至 ${target.expiresOn}，本次核销日期为 ${redeemedOn}。`,
            },
          ]
        : []),
    ];

    /** 逐个弹出待确认项；全部确认后才真正提交，任一项选「返回检查」都不写库。 */
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
  }, [draft, target, save]);

  const handleCancel = useCallback(() => {
    // 放弃确认统一由 usePreventRemove 处理，这里只负责发起返回。
    router.back();
  }, [router]);

  const usedUp = target.remaining === 0;

  return (
    <FormScreen
      title="记录一次核销"
      subtitle={`来自「${target.purchaseName}」`}
      onCancel={handleCancel}
      footer={
        <Button
          label={saving ? '正在保存…' : '保存核销'}
          variant="primary"
          loading={saving}
          disabled={usedUp}
          disabledReason={usedUp ? '已无剩余次数' : undefined}
          accessibilityLabel={usedUp ? '保存核销，已无剩余次数，无法保存' : '保存核销'}
          onPress={handleSubmit}
        />
      }
    >
      {saveError ? (
        <InlineNotice
          tone="warning"
          message={saveError}
          actionLabel="刷新项目信息"
          onActionPress={onRefreshTarget}
        />
      ) : null}

      {refreshFailed ? (
        <InlineNotice
          tone="warning"
          message="没能刷新项目信息，下面显示的剩余次数可能不是最新的。"
          actionLabel="重试"
          onActionPress={onRefreshTarget}
        />
      ) : null}

      {usedUp ? (
        <InlineNotice
          tone="warning"
          message="这个项目已经没有剩余次数，无法再记录核销。"
        />
      ) : null}

      <Card style={styles.target}>
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>项目</Text>
          <Text style={styles.targetValue}>{target.itemName}</Text>
        </View>
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>当前剩余次数</Text>
          <Text style={styles.targetValue}>{target.remaining} 次</Text>
        </View>
      </Card>

      <View style={styles.section}>
        <TextField
          label="核销日期"
          required
          value={draft.redeemedOn}
          onChangeText={(value) => updateDraft({ redeemedOn: value })}
          placeholder="2026-09-16"
          hint="按 YYYY-MM-DD 填写，默认今天"
          keyboardType="numbers-and-punctuation"
          error={errors?.redeemedOn}
        />

        <InstitutionPicker
          options={institutions}
          mode={draft.institutionMode}
          institutionId={draft.institutionId}
          query={draft.institutionQuery}
          error={errors?.institution}
          onQueryChange={handleInstitutionQueryChange}
          onSelectExisting={handleSelectInstitution}
          onClear={handleClearInstitution}
        />

        <TextField
          label="城市"
          value={draft.city}
          onChangeText={(value) => updateDraft({ city: value })}
          placeholder="例如 上海"
        />

        <TextField
          label="备注"
          value={draft.notes}
          onChangeText={(value) => updateDraft({ notes: value })}
          placeholder="例如 换了一位操作医生"
          multiline
        />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  target: {
    gap: Layout.labelGap,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  targetLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  targetValue: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  section: {
    gap: Layout.fieldGap,
  },
});
