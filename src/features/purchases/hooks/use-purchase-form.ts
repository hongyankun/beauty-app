import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { InstitutionOption } from '@/db';
import { ALLOCATION_TOLERANCE_MINOR, formatMinorAsYuan } from '@/utils/money';
import { createUuid } from '@/utils/uuid';
import {
  allocatedTotalMinor,
  createEmptyItemDraft,
  isDraftDirty,
  validatePurchaseDraft,
  type PurchaseDraft,
  type PurchaseDraftInput,
  type PurchaseFormErrors,
  type PurchaseItemDraft,
} from '../purchase-draft';
import { toUserMessage } from '../services/errors';
import { useInstitutionOptions } from './use-institution-options';

/**
 * 套餐表单的状态与交互，新增页与编辑页共用。
 *
 * 承担三件在两个流程里逐字相同的事：草稿状态与字段处理、提交闸门与错误映射、
 * 未保存内容的返回拦截。留给页面的只有「初值从哪来」「保存调哪个 service」
 * 「成功后去哪」——这三点才是两者真正的区别（任务书第四节）。
 *
 * 这里不写 SQL，也不 import expo-sqlite：保存动作由页面以回调形式传进来，
 * 实际落库仍然发生在 service 层（ARCHITECTURE 第三节）。
 */

export type UsePurchaseFormOptions = {
  /** 表单初值。必须是稳定引用，它同时是「有没有改动」的比较基准 */
  readonly initialDraft: PurchaseDraft;
  /** 校验通过后的保存动作；抛出异常即视为失败，草稿原样保留 */
  readonly onSave: (input: PurchaseDraftInput) => Promise<void>;
  /**
   * 保存成功后的导航。
   *
   * 与 `onSave` 分开，是为了保证「解除返回拦截」发生在发起导航**之前**：
   * 合在一起时导航会先被返回拦截挡下，此时草稿仍然是脏的，
   * 用户刚保存成功却被问要不要放弃修改。
   */
  readonly onSaved: () => void;
  /** 保存失败且拿不到业务原因时的兜底文案 */
  readonly saveErrorFallback: string;
  /** 放弃确认弹窗的文案 */
  readonly discard: {
    readonly title: string;
    readonly message: string;
    readonly keepLabel: string;
    readonly discardLabel: string;
  };
  /** 各项目的购买次数下限，以草稿 key 为索引；新增流程不传（见 `validatePurchaseDraft`） */
  readonly minQuantityByKey?: Readonly<Record<string, number>>;
};

export type PurchaseFormController = {
  readonly draft: PurchaseDraft;
  readonly errors: PurchaseFormErrors | null;
  /** 顶部提示条的内容；没有待处理的问题时为 null */
  readonly saveError: string | null;
  readonly saving: boolean;
  readonly institutions: readonly InstitutionOption[];
  /** 项目分摊合计，整数分；有行还没填完时为 null */
  readonly allocatedMinor: number | null;
  readonly updateField: (patch: Partial<PurchaseDraft>) => void;
  readonly changeItem: (key: string, patch: Partial<PurchaseItemDraft>) => void;
  /** 直接把一行从草稿里去掉。是否需要确认由页面决定 */
  readonly removeItem: (key: string) => void;
  readonly addItem: () => void;
  readonly selectInstitution: (option: InstitutionOption) => void;
  readonly changeInstitutionQuery: (query: string) => void;
  readonly clearInstitution: () => void;
  readonly submit: () => void;
  readonly cancel: () => void;
};

export function usePurchaseForm(options: UsePurchaseFormOptions): PurchaseFormController {
  const router = useRouter();
  const navigation = useNavigation();
  const institutions = useInstitutionOptions();

  const { initialDraft, discard } = options;
  const [draft, setDraft] = useState<PurchaseDraft>(initialDraft);
  const [errors, setErrors] = useState<PurchaseFormErrors | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住。 */
  const submitting = useRef(false);
  /**
   * 保存成功后允许直接离开，不再弹放弃确认。
   *
   * 必须是 state 而不是 ref：下面的拦截开关在**渲染期**读取，
   * 改一个 ref 不会让它重新计算。
   */
  const [saved, setSaved] = useState(false);

  // 回调们只注册一次，不能闭包住某一次渲染的值，否则它们永远拿着挂载那一刻的
  // 草稿做判断。用 ref 取最新值。
  const draftRef = useRef(draft);
  const optionsRef = useRef(options);
  useEffect(() => {
    draftRef.current = draft;
    optionsRef.current = options;
  });

  /**
   * 拦截返回手势、Android 实体返回键与页面栈弹出。
   *
   * 只拦顶部的取消按钮是不够的：iOS 侧滑返回与实体返回键不经过那个按钮，
   * 用户改了一半就会静默丢失（IA 第 4.3 节第 4 条、PRD-ERR-003）。
   *
   * 这里必须用 `usePreventRemove`，不能自己监听 `beforeRemove`：native-stack 的
   * iOS 侧滑由**原生侧**完成弹出，JS 里 `preventDefault()` 拦不回已经弹掉的页面，
   * 用户点「继续填写」仍会退出。这个 hook 会把「本页不允许被移除」同步给原生栈。
   *
   * 一字未改时不拦截，直接返回（任务书第五节第 8 条）；保存成功后与保存进行中同样不拦。
   */
  const preventRemove = isDraftDirty(draft, initialDraft) && !saved && !saving;

  usePreventRemove(preventRemove, ({ data }) => {
    Alert.alert(discard.title, discard.message, [
      // 只关掉弹窗：不 dispatch 原返回 action，页面留在原处，输入原样保留。
      { text: discard.keepLabel, style: 'cancel' },
      {
        // 只有用户明确选择放弃时，才把原来的返回动作补发一次。
        text: discard.discardLabel,
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  /**
   * 保存成功后离开。
   *
   * 放在 effect 里而不是异步回调里：`preventRemove` 是渲染期的值，
   * 在回调里紧接着导航时它还是 true，刚保存成功的用户会被问要不要放弃修改。
   */
  useEffect(() => {
    if (saved) {
      optionsRef.current.onSaved();
    }
  }, [saved]);

  const updateField = useCallback((patch: Partial<PurchaseDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
  }, []);

  const changeItem = useCallback((key: string, patch: Partial<PurchaseItemDraft>) => {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }, []);

  const removeItem = useCallback((key: string) => {
    setDraft((previous) => ({
      ...previous,
      items: previous.items.filter((item) => item.key !== key),
    }));
  }, []);

  const addItem = useCallback(() => {
    // 新行的 key 用 UUID，不会与既有项目的 ID 相撞；它没有 purchaseItemId，
    // 保存时就是靠这一点被识别为「要新增的项目」。
    setDraft((previous) => ({
      ...previous,
      items: [...previous.items, createEmptyItemDraft(createUuid())],
    }));
  }, []);

  const selectInstitution = useCallback((option: InstitutionOption) => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'existing',
      institutionId: option.id,
      institutionQuery: option.name,
      // 城市只在用户还没填时带入，不覆盖已经手填的内容。
      city: previous.city.trim() === '' ? (option.city ?? '') : previous.city,
    }));
  }, []);

  const changeInstitutionQuery = useCallback((query: string) => {
    setDraft((previous) => ({
      ...previous,
      // 清空输入等于不记录机构；否则一律先当作新机构，
      // 真正是否新建由 service 按 normalized_name 判重决定。
      institutionMode: query.trim() === '' ? 'none' : 'new',
      institutionId: null,
      institutionQuery: query,
    }));
  }, []);

  const clearInstitution = useCallback(() => {
    setDraft((previous) => ({
      ...previous,
      institutionMode: 'none',
      institutionId: null,
      institutionQuery: '',
    }));
  }, []);

  const runSave = useCallback(async (input: PurchaseDraftInput) => {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      await optionsRef.current.onSave(input);
      // 先解除返回拦截再导航，且不复位闸门：页面即将离开，
      // 复位只会给第二次点击留出空档。
      setSaved(true);
    } catch (error) {
      setSaveError(toUserMessage(error, optionsRef.current.saveErrorFallback));
      submitting.current = false;
      setSaving(false);
    }
  }, []);

  const submit = useCallback(() => {
    const current = draftRef.current;
    const result = validatePurchaseDraft(current, {
      minQuantityByKey: optionsRef.current.minQuantityByKey,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setSaveError('还有几处需要修改，请检查下方标红的内容。');
      return;
    }

    setErrors(null);
    setSaveError(null);

    // 分摊与总价差额超过 1 元时提示确认，但不禁止保存（PRD-PUR-005、E-11）。
    const allocated = allocatedTotalMinor(current);
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
          { text: '仍然保存', onPress: () => void runSave(result.input) },
        ],
      );
      return;
    }

    void runSave(result.input);
  }, [runSave]);

  const cancel = useCallback(() => {
    // 放弃确认统一由 usePreventRemove 处理，这里只负责发起返回。
    router.back();
  }, [router]);

  const allocatedMinor = useMemo(() => allocatedTotalMinor(draft), [draft]);

  return {
    draft,
    errors,
    saveError,
    saving,
    institutions,
    allocatedMinor,
    updateField,
    changeItem,
    removeItem,
    addItem,
    selectInstitution,
    changeInstitutionQuery,
    clearInstitution,
    submit,
    cancel,
  };
}
