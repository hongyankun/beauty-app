import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { PurchaseItemCategory } from '@/db';
import { useDataAccess } from '@/hooks/use-data-access';
import { createWishlistItem } from '../services/create-wishlist-item';
import { deleteWishlistItem } from '../services/delete-wishlist-item';
import { toUserMessage } from '../services/errors';
import type { WishlistInstitutionOption } from '../services/list-institution-options';
import { updateWishlistItem } from '../services/update-wishlist-item';
import {
  createEmptyWishlistDraft,
  createWishlistDraftFrom,
  isWishlistDraftDirty,
  validateWishlistDraft,
  type WishlistDraft,
  type WishlistDraftSource,
  type WishlistFormErrors,
} from '../wishlist-draft';
import { useWishlistInstitutionOptions } from './use-wishlist-institution-options';

/**
 * 心愿表单的状态与交互，**新增与编辑共用同一份**。
 *
 * 两个流程真正不同的只有三件事：初始草稿从哪来、保存调哪个 service、
 * 有没有删除入口。其余的字段状态、校验、脏判断、提交闸门、返回拦截
 * 在两边字字相同，因此只写一次（任务书第 7.3 节）。
 *
 * 这里不写 SQL，也不 import expo-sqlite：落库全部发生在 service 层
 * （ARCHITECTURE 第三节、任务书第五节第 9 条）。
 */

/** 放在模块级：文案不随状态变化，没必要每次渲染新建一个对象。 */
const DISCARD_PROMPT = {
  title: '放弃本次修改？',
  message: '刚才填写的内容不会被保存。',
  keepLabel: '继续编辑',
  discardLabel: '放弃修改',
} as const;

const CREATE_FALLBACK = '没能保存这个心愿，请重试。你填写的内容都还在。';
const UPDATE_FALLBACK = '没能保存这次修改，请重试。你填写的内容都还在。';
const DELETE_FALLBACK = '没能删除这个心愿，请重试。';
const INVALID_MESSAGE = '还有一处需要修改，请检查下方标红的内容。';

/** 新增，或编辑某一条既有心愿。 */
export type WishlistFormMode =
  | { readonly kind: 'create' }
  | {
      readonly kind: 'edit';
      readonly wishlistItemId: string;
      readonly source: WishlistDraftSource;
    };

export type WishlistFormController = {
  readonly draft: WishlistDraft;
  readonly errors: WishlistFormErrors | null;
  /** 顶部提示条的内容；没有待处理的问题时为 null */
  readonly formError: string | null;
  readonly saving: boolean;
  readonly deleting: boolean;
  /** 删除失败的说明，展示在确认框里；没有问题时为 null */
  readonly deleteError: string | null;
  readonly institutions: readonly WishlistInstitutionOption[];
  readonly updateField: (patch: Partial<WishlistDraft>) => void;
  readonly selectCategory: (category: PurchaseItemCategory) => void;
  readonly selectInstitution: (institutionId: string) => void;
  readonly clearInstitution: () => void;
  readonly submit: () => void;
  readonly cancel: () => void;
  /** 永久删除。二次确认由页面负责，这里只执行 */
  readonly remove: () => void;
};

export function useWishlistForm(mode: WishlistFormMode): WishlistFormController {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();

  /**
   * 初值只算一次。页面按心愿 ID 给这个组件加了 key，所以这里不需要跟着
   * `mode` 变化重算——重算会把「有没有改动」的比较基准换掉。
   */
  const [initialDraft] = useState<WishlistDraft>(() =>
    mode.kind === 'edit' ? createWishlistDraftFrom(mode.source) : createEmptyWishlistDraft(),
  );
  const [draft, setDraft] = useState<WishlistDraft>(initialDraft);
  const [errors, setErrors] = useState<WishlistFormErrors | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 打开这一页时原本关联的机构。用它去取候选，才能在它已归档时仍然显示出来。
  const [linkedInstitutionId] = useState<string | null>(initialDraft.institutionId);
  const institutions = useWishlistInstitutionOptions(linkedInstitutionId);

  /**
   * 提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住
   * （任务书第 7.6 节：不能只依赖按钮禁用）。保存与删除共用一个闸门：
   * 两者都会写同一行，不该同时在飞。
   */
  const busy = useRef(false);
  /**
   * 保存或删除成功后允许直接离开，不再弹放弃确认。
   *
   * 必须是 state 而不是 ref：下面的拦截开关在**渲染期**读取，
   * 改一个 ref 不会让它重新计算。
   */
  const [finished, setFinished] = useState(false);

  // `submit` 只注册一次，不能闭包住某一次渲染的草稿，否则它永远拿着挂载那一刻的值做判断。
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const goBack = useCallback(() => {
    // 表单在根 Stack 上，正常情况下栈里就压着心愿单 Tab，直接 back 即可回到列表。
    // 只有被深链直接拉起、栈里没有上一页时才需要显式落到列表。
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/wishlist');
    }
  }, [router]);

  /**
   * 拦截返回手势、Android 实体返回键与页面栈弹出。
   *
   * 只拦顶部的取消按钮是不够的：iOS 侧滑返回与实体返回键不经过那个按钮，
   * 用户填了一半就会静默丢失（任务书第 7.5 节、IA 第 4.3 节第 4 条）。
   *
   * 这里必须用 `usePreventRemove`，不能自己监听 `beforeRemove`：native-stack 的
   * iOS 侧滑由**原生侧**完成弹出，JS 里 `preventDefault()` 只拦得住导航状态，
   * 拦不回已经弹掉的页面，用户点「继续编辑」仍会退出，并留下
   * 「removed natively but prevented from JS state」警告。这个 hook 会把
   * 「本页不允许被移除」同步给原生栈，原生侧因此不会抢先弹页。
   *
   * 一字未改、已经保存或删除成功，以及保存与删除进行中，都不拦截。
   */
  const preventRemove =
    isWishlistDraftDirty(draft, initialDraft) && !finished && !saving && !deleting;

  usePreventRemove(preventRemove, ({ data }) => {
    Alert.alert(DISCARD_PROMPT.title, DISCARD_PROMPT.message, [
      // 「继续编辑」只关掉弹窗：不 dispatch 原返回 action，页面留在原处，输入原样保留。
      { text: DISCARD_PROMPT.keepLabel, style: 'cancel' },
      {
        // 只有用户明确选择放弃时，才把原来的返回动作补发一次。
        text: DISCARD_PROMPT.discardLabel,
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  /**
   * 保存或删除成功后离开。
   *
   * 放在 effect 里而不是异步回调里：`preventRemove` 是渲染期的值，
   * 在回调里紧接着返回时它还是 true，刚保存成功的用户会被问要不要放弃修改。
   * 等这次渲染提交完再走，拦截已经解除。
   */
  useEffect(() => {
    if (finished) {
      goBack();
    }
  }, [finished, goBack]);

  const updateField = useCallback((patch: Partial<WishlistDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    // 用户一动手就把上一次的报错清掉，不让红字一直挂在已经改过的字段上。
    setErrors(null);
    setFormError(null);
  }, []);

  const selectCategory = useCallback((category: PurchaseItemCategory) => {
    // 分类是选填的，再点一次已选中的即取消选择。
    setDraft((previous) => ({
      ...previous,
      category: previous.category === category ? null : category,
    }));
  }, []);

  const selectInstitution = useCallback((institutionId: string) => {
    setDraft((previous) => ({ ...previous, institutionId }));
  }, []);

  const clearInstitution = useCallback(() => {
    setDraft((previous) => ({ ...previous, institutionId: null }));
  }, []);

  const submit = useCallback(() => {
    if (busy.current) {
      return;
    }

    const validation = validateWishlistDraft(draftRef.current);
    if (!validation.ok) {
      // 本地先拦一道，让用户立刻看到原因；service 层仍会再校验一次。
      setErrors(validation.errors);
      setFormError(INVALID_MESSAGE);
      return;
    }

    busy.current = true;
    setErrors(null);
    setFormError(null);
    setSaving(true);

    void (async () => {
      try {
        if (mode.kind === 'edit') {
          await updateWishlistItem(dataAccess, mode.wishlistItemId, validation.input);
        } else {
          await createWishlistItem(dataAccess, validation.input);
        }
        // 先解除返回拦截再发起返回，否则刚保存成功的用户会被问要不要放弃修改。
        // 也不复位闸门：页面即将离开，复位只会给第二次点击留出空档。
        setFinished(true);
      } catch (error) {
        // 失败时草稿原样保留，用户不用重新填一遍（任务书第 8.2 节）。
        setFormError(
          toUserMessage(error, mode.kind === 'edit' ? UPDATE_FALLBACK : CREATE_FALLBACK),
        );
        busy.current = false;
        setSaving(false);
      }
    })();
  }, [dataAccess, mode]);

  const cancel = useCallback(() => {
    // 放弃确认统一由 usePreventRemove 处理，这里只负责发起返回。
    goBack();
  }, [goBack]);

  const remove = useCallback(() => {
    if (mode.kind !== 'edit' || busy.current) {
      return;
    }
    busy.current = true;
    setDeleteError(null);
    setDeleting(true);

    void (async () => {
      try {
        await deleteWishlistItem(dataAccess, mode.wishlistItemId);
        setFinished(true);
      } catch (error) {
        // 删除失败就留在本页，不假装成功（任务书第 8.2 节）。
        setDeleteError(toUserMessage(error, DELETE_FALLBACK));
        busy.current = false;
        setDeleting(false);
      }
    })();
  }, [dataAccess, mode]);

  return {
    draft,
    errors,
    formError,
    saving,
    deleting,
    deleteError,
    institutions,
    updateField,
    selectCategory,
    selectInstitution,
    clearInstitution,
    submit,
    cancel,
    remove,
  };
}
