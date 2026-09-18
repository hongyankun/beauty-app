import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDataAccess } from '@/hooks/use-data-access';
import { toUserMessage } from '../services/errors';
import type { InstitutionDetail } from '../services/get-institution';
import { setInstitutionArchived } from '../services/set-institution-archived';
import { updateInstitution } from '../services/update-institution';

/**
 * 机构编辑页的状态与交互。
 *
 * 承担三件事：草稿状态、提交闸门与错误映射、未保存内容的返回拦截。
 * 这里不写 SQL，也不 import expo-sqlite：落库全部发生在 service 层
 * （ARCHITECTURE 第三节、任务书第十二节）。
 */

/** 放在模块级：文案不随状态变化，没必要每次渲染新建一个对象。 */
const DISCARD_PROMPT = {
  title: '放弃本次修改？',
  message: '刚才改动的内容不会被保存。',
  keepLabel: '继续编辑',
  discardLabel: '放弃修改',
} as const;

const SAVE_FALLBACK = '没能保存这次修改，请重试。你填写的内容都还在。';
const ARCHIVE_FALLBACK = '没能归档这个机构，请重试。';
const RESTORE_FALLBACK = '没能恢复这个机构，请重试。';

export type InstitutionDraft = {
  readonly name: string;
  readonly city: string;
  readonly notes: string;
};

function createDraft(detail: InstitutionDetail): InstitutionDraft {
  return {
    name: detail.name,
    city: detail.city ?? '',
    notes: detail.notes ?? '',
  };
}

function isDirty(draft: InstitutionDraft, initial: InstitutionDraft): boolean {
  return (
    draft.name !== initial.name || draft.city !== initial.city || draft.notes !== initial.notes
  );
}

export type InstitutionEditorController = {
  readonly draft: InstitutionDraft;
  /** 机构当前是否已归档。归档或恢复成功后就地更新，不重读整页 */
  readonly isArchived: boolean;
  /** 名称字段的校验提示；没有问题时为 null */
  readonly nameError: string | null;
  /** 顶部提示条的内容；没有待处理的问题时为 null */
  readonly actionError: string | null;
  readonly saving: boolean;
  /** 归档或恢复进行中 */
  readonly changingArchive: boolean;
  readonly changeName: (value: string) => void;
  readonly changeCity: (value: string) => void;
  readonly changeNotes: (value: string) => void;
  readonly submit: () => void;
  readonly cancel: () => void;
  /** 归档或恢复。确认弹窗由页面负责，这里只执行 */
  readonly setArchived: (nextArchived: boolean) => void;
};

export function useInstitutionEditor(detail: InstitutionDetail): InstitutionEditorController {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();

  /**
   * 初值只算一次。页面按机构 ID 给这个组件加了 key，所以这里不需要跟着
   * `detail` 变化重算——重算会把「有没有改动」的比较基准换掉。
   */
  const [initialDraft] = useState(() => createDraft(detail));
  const [draft, setDraft] = useState<InstitutionDraft>(initialDraft);
  const [isArchived, setIsArchived] = useState(detail.isArchived);
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingArchive, setChangingArchive] = useState(false);

  /**
   * 提交闸门。放在 ref 而不是 state 里，连点两次时第二次同步就能被挡住
   * （任务书第十节：保存、归档、恢复的快速重复点击只执行一次）。
   * 保存与归档共用一个闸门：两者都会写同一行，不该同时在飞。
   */
  const busy = useRef(false);
  /**
   * 保存成功后允许直接离开，不再弹放弃确认。
   *
   * 必须是 state 而不是 ref：下面的拦截开关在**渲染期**读取，
   * 改一个 ref 不会让它重新计算。
   */
  const [saved, setSaved] = useState(false);

  // `submit` 只注册一次，不能闭包住某一次渲染的草稿，否则它永远拿着挂载那一刻的值做判断。
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me/institutions');
    }
  }, [router]);

  /**
   * 拦截返回手势、Android 实体返回键与页面栈弹出。
   *
   * 只拦顶部的取消按钮是不够的：iOS 侧滑返回与实体返回键不经过那个按钮，
   * 用户改了一半就会静默丢失（任务书第十五节、IA 第 4.3 节第 4 条）。
   *
   * 这里必须用 `usePreventRemove`，不能自己监听 `beforeRemove`：native-stack 的
   * iOS 侧滑由**原生侧**完成弹出，JS 里 `preventDefault()` 只拦得住导航状态，
   * 拦不回已经弹掉的页面，用户点「继续编辑」仍会退出，并留下
   * 「removed natively but prevented from JS state」警告。这个 hook 会把
   * 「本页不允许被移除」同步给原生栈，原生侧因此不会抢先弹页。
   *
   * 一字未改、已经保存成功，或保存与归档恢复正在进行时，都不拦截。
   */
  const preventRemove =
    isDirty(draft, initialDraft) && !saved && !saving && !changingArchive;

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
   * 保存成功后离开。
   *
   * 放在 effect 里而不是异步回调里：`preventRemove` 是渲染期的值，
   * 在回调里紧接着返回时它还是 true，刚保存成功的用户会被问要不要放弃修改。
   * 等这次渲染提交完再走，拦截已经解除。
   */
  useEffect(() => {
    if (saved) {
      goBack();
    }
  }, [saved, goBack]);

  const changeName = useCallback((value: string) => {
    setDraft((previous) => ({ ...previous, name: value }));
    setNameError(null);
  }, []);

  const changeCity = useCallback((value: string) => {
    setDraft((previous) => ({ ...previous, city: value }));
  }, []);

  const changeNotes = useCallback((value: string) => {
    setDraft((previous) => ({ ...previous, notes: value }));
  }, []);

  const submit = useCallback(() => {
    if (busy.current) {
      return;
    }

    const current = draftRef.current;
    if (current.name.trim() === '') {
      // 本地先拦一道，让用户立刻看到原因；service 层仍会再校验一次。
      setNameError('请填写机构名称');
      setActionError('还有一处需要修改，请检查下方标红的内容。');
      return;
    }

    busy.current = true;
    setNameError(null);
    setActionError(null);
    setSaving(true);

    void (async () => {
      try {
        await updateInstitution(dataAccess, {
          institutionId: detail.id,
          name: current.name,
          city: current.city,
          notes: current.notes,
        });
        // 先解除返回拦截再发起返回，否则刚保存成功的用户会被问要不要放弃修改。
        // 也不复位闸门：页面即将离开，复位只会给第二次点击留出空档。
        setSaved(true);
      } catch (error) {
        // 失败时草稿原样保留，用户不用重新输入一遍（任务书第十节、第十四节）。
        setActionError(toUserMessage(error, SAVE_FALLBACK));
        busy.current = false;
        setSaving(false);
      }
    })();
  }, [dataAccess, detail.id]);

  const cancel = useCallback(() => {
    // 放弃确认统一由 usePreventRemove 处理，这里只负责发起返回。
    goBack();
  }, [goBack]);

  const setArchived = useCallback(
    (nextArchived: boolean) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setActionError(null);
      setChangingArchive(true);

      void (async () => {
        try {
          await setInstitutionArchived(dataAccess, detail.id, nextArchived);
          // 归档与恢复不改名称、城市、备注与关联条数，因此不必重读整页，
          // 就地翻转状态即可；用户正在输入框里改到一半的内容也不会被冲掉。
          setIsArchived(nextArchived);
        } catch (error) {
          setActionError(
            toUserMessage(error, nextArchived ? ARCHIVE_FALLBACK : RESTORE_FALLBACK),
          );
        } finally {
          busy.current = false;
          setChangingArchive(false);
        }
      })();
    },
    [dataAccess, detail.id],
  );

  return {
    draft,
    isArchived,
    nameError,
    actionError,
    saving,
    changingArchive,
    changeName,
    changeCity,
    changeNotes,
    submit,
    cancel,
    setArchived,
  };
}
