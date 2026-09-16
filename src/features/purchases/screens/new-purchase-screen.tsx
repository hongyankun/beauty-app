import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, FormScreen, InlineNotice, TextField } from '@/components/ui';
import type { InstitutionOption } from '@/db';
import { useDataAccess } from '@/hooks/use-data-access';
import { Colors, Layout, TextStyles } from '@/theme';
import { todayBusinessDate } from '@/utils/business-date';
import { ALLOCATION_TOLERANCE_MINOR, formatMinorAsYuan } from '@/utils/money';
import { createUuid } from '@/utils/uuid';
import { InstitutionPicker } from '../components/institution-picker';
import { PurchaseItemEditor } from '../components/purchase-item-editor';
import { useInstitutionOptions } from '../hooks/use-institution-options';
import {
  allocatedTotalMinor,
  createEmptyItemDraft,
  createInitialDraft,
  isDraftDirty,
  validatePurchaseDraft,
  type PurchaseDraft,
  type PurchaseFormErrors,
  type PurchaseItemDraft,
} from '../purchase-draft';
import { createPurchase, type CreatePurchaseInput } from '../services/create-purchase';
import { toUserMessage } from '../services/errors';

/**
 * 新增购买记录（全屏表单，覆盖 Tab 栏）。
 *
 * 校验与金额换算全部委托给 `purchase-draft` 的纯函数，落库委托给 `createPurchase`，
 * 这个组件只负责状态、导航与提示（ARCHITECTURE 第三节的分层）。
 */
export function NewPurchaseScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();
  const institutions = useInstitutionOptions();

  // 只在挂载时算一次：购买日期默认今天，项目区默认给一行空项目（IA 第 3.6.1 节）。
  const initialDraft = useMemo(() => createInitialDraft(todayBusinessDate(), createUuid()), []);
  const [draft, setDraft] = useState<PurchaseDraft>(initialDraft);
  const [errors, setErrors] = useState<PurchaseFormErrors | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住。 */
  const submitting = useRef(false);
  /** 保存成功后允许直接离开，不再弹放弃确认。 */
  const saved = useRef(false);

  // `beforeRemove` 的回调只注册一次，不能闭包住某一次渲染的草稿，
  // 否则它永远拿着挂载时那份空草稿判断，返回时不会弹确认。
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /**
   * 拦截返回手势、Android 实体返回键与页面栈弹出。
   *
   * 只拦 `FormScreen` 的取消按钮是不够的：侧滑返回与实体返回键不经过那个按钮，
   * 用户填了一半就会静默丢失（IA 第 4.3 节第 4 条、PRD-ERR-003）。
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (saved.current || !isDraftDirty(draftRef.current, initialDraft)) {
        return;
      }
      event.preventDefault();
      Alert.alert('放弃这条购买记录？', '已经填写的内容不会被保存。', [
        { text: '继续填写', style: 'cancel' },
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, initialDraft]);

  const updateDraft = useCallback((patch: Partial<PurchaseDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  const handleItemChange = useCallback((key: string, patch: Partial<PurchaseItemDraft>) => {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }, []);

  const handleItemRemove = useCallback((key: string) => {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.key !== key),
    }));
  }, []);

  const handleItemAdd = useCallback(() => {
    setDraft((previous) => ({
      ...previous,
      items: [...previous.items, createEmptyItemDraft(createUuid())],
    }));
  }, []);

  const handleSelectInstitution = useCallback((option: InstitutionOption) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'existing',
      institutionId: option.id,
      institutionQuery: option.name,
      // 城市只在用户还没填时带入，不覆盖已经手填的内容。
      city: previous.city.trim() === '' ? (option.city ?? '') : previous.city,
    }));
  }, []);

  const handleInstitutionQueryChange = useCallback((query: string) => {
    setDraft((previous) => ({
      ...previous,
      // 清空输入等于不记录机构；否则一律先当作新机构，
      // 真正是否新建由 service 按 normalized_name 判重决定。
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
    async (input: CreatePurchaseInput) => {
      if (submitting.current) {
        return;
      }
      submitting.current = true;
      setSaving(true);
      setSaveError(null);

      try {
        await createPurchase(dataAccess, input);
        saved.current = true;
        // 购买记录详情页尚未实现，先回到记录列表；列表在获得焦点时会刷新。
        // 用 dismissTo 而不是 replace：replace 会把表单这一层换成第二个 (tabs) 入口，
        // 根 Stack 里就会同时存在两份 Tab 导航。dismissTo 是把表单弹掉、回到已有的那份。
        if (router.canDismiss()) {
          router.dismissTo('/(tabs)/records');
        } else {
          router.replace('/(tabs)/records');
        }
      } catch (error) {
        setSaveError(
          toUserMessage(error, '没能保存这条购买记录，请重试。你填写的内容都还在。'),
        );
        submitting.current = false;
        setSaving(false);
      }
    },
    [dataAccess, router],
  );

  const handleSubmit = useCallback(() => {
    const result = validatePurchaseDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setSaveError('还有几处需要修改，请检查下方标红的内容。');
      return;
    }

    setErrors(null);
    setSaveError(null);

    // 分摊与总价差额超过 1 元时提示确认，但不禁止保存（PRD-PUR-005、E-11）。
    const allocated = allocatedTotalMinor(draft);
    const difference =
      allocated === null ? 0 : Math.abs(allocated - result.input.totalAmountMinor);

    if (difference > ALLOCATION_TOLERANCE_MINOR) {
      Alert.alert(
        '总价与项目分摊不一致',
        `项目分摊合计 ${formatMinorAsYuan(allocated ?? 0)}，套餐总价 ${formatMinorAsYuan(
          result.input.totalAmountMinor,
        )}，相差 ${formatMinorAsYuan(difference)}。折扣或赠送会造成这种差额，可以继续保存。`,
        [
          { text: '返回修改', style: 'cancel' },
          { text: '仍然保存', onPress: () => void save(result.input) },
        ],
      );
      return;
    }

    void save(result.input);
  }, [draft, save]);

  const handleCancel = useCallback(() => {
    // 放弃确认统一由 beforeRemove 监听处理，这里只负责发起返回。
    router.back();
  }, [router]);

  const allocated = allocatedTotalMinor(draft);

  return (
    <FormScreen
      title="新增购买记录"
      subtitle="记录一次购买，以及它包含的项目。"
      onCancel={handleCancel}
      footer={
        <Button
          label={saving ? '正在保存…' : '保存套餐'}
          variant="primary"
          loading={saving}
          onPress={handleSubmit}
        />
      }
    >
      {saveError ? <InlineNotice tone="warning" message={saveError} /> : null}

      <View style={styles.section}>
        <TextField
          label="套餐名称"
          required
          value={draft.name}
          onChangeText={(value) => updateDraft({ name: value })}
          placeholder="例如 秋季紧致套餐"
          error={errors?.name}
        />

        <TextField
          label="购买日期"
          required
          value={draft.purchaseDate}
          onChangeText={(value) => updateDraft({ purchaseDate: value })}
          placeholder="2026-09-15"
          hint="按 YYYY-MM-DD 填写"
          keyboardType="numbers-and-punctuation"
          error={errors?.purchaseDate}
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
          label="套餐总价"
          required
          value={draft.totalAmount}
          onChangeText={(value) => updateDraft({ totalAmount: value })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          hint="单位为元"
          error={errors?.totalAmount}
        />

        <TextField
          label="有效期"
          value={draft.expiresOn}
          onChangeText={(value) => updateDraft({ expiresOn: value })}
          placeholder="2027-09-15"
          hint="留空表示未知或长期有效"
          keyboardType="numbers-and-punctuation"
          error={errors?.expiresOn}
        />

        <TextField
          label="备注"
          value={draft.notes}
          onChangeText={(value) => updateDraft({ notes: value })}
          placeholder="例如 与朋友一起购买的双人套餐"
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>套餐包含的项目</Text>
        <Text style={styles.sectionHint}>至少需要一个项目。</Text>

        {draft.items.map((item, index) => (
          <PurchaseItemEditor
            key={item.key}
            item={item}
            position={index + 1}
            errors={errors?.items[item.key]}
            onChange={handleItemChange}
            onRemove={handleItemRemove}
            removable={draft.items.length > 1}
          />
        ))}

        <Button label="添加一个项目" icon="plus" onPress={handleItemAdd} />

        {allocated === null ? null : (
          <Card>
            <Text style={styles.allocationLabel}>项目分摊合计</Text>
            <Text style={styles.allocationValue}>{formatMinorAsYuan(allocated)}</Text>
            <Text style={styles.allocationHint}>
              分摊合计与套餐总价可以不同，折扣与赠送都会造成差额。
            </Text>
          </Card>
        )}
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.fieldGap,
  },
  sectionTitle: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  sectionHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    marginTop: -Layout.cardGap,
  },
  allocationLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
  },
  allocationValue: {
    ...TextStyles.numeric,
    color: Colors.textPrimary,
    marginTop: Layout.tightGap,
  },
  allocationHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    marginTop: Layout.tightGap,
  },
});
