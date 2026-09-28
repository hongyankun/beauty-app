import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import type { ProvinceCitySelection } from '@/data/administrative-divisions';
import { useDataAccess } from '@/hooks/use-data-access';
import { toUserMessage } from '../services/errors';
import type { InstitutionDetail } from '../services/get-institution';
import {
  describeStoredLocation,
  isSameStoredLocation,
  locationColumnsFromSelection,
  type LegacyLocation,
  type StoredLocation,
} from '../services/institution-location';
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

/**
 * 地点草稿。`touched: false` 表示用户没有确认过新的选择、也没有清除——
 * 这时页面不提交地点，service 原样保留数据库里的四列（包括当前目录不认识的旧值）。
 */
export type LocationDraft =
  | { readonly touched: false }
  | { readonly touched: true; readonly value: ProvinceCitySelection | null };

export type InstitutionDraft = {
  readonly name: string;
  readonly location: LocationDraft;
  readonly notes: string;
};

function createDraft(detail: InstitutionDetail): InstitutionDraft {
  return {
    name: detail.name,
    location: { touched: false },
    notes: detail.notes ?? '',
  };
}

/** 用户确认的地点与打开页面时的四列是否不同。选回原值不算改动。 */
function locationChanged(location: LocationDraft, initial: StoredLocation): boolean {
  return (
    location.touched && !isSameStoredLocation(locationColumnsFromSelection(location.value), initial)
  );
}

function isDirty(draft: InstitutionDraft, initial: InstitutionDraft, initialLocation: StoredLocation): boolean {
  return (
    draft.name !== initial.name ||
    draft.notes !== initial.notes ||
    locationChanged(draft.location, initialLocation)
  );
}

export type InstitutionEditorController = {
  readonly draft: InstitutionDraft;
  /** 交给选择器的当前值：未修改且库里是与目录一致的 B / C 时为该值，否则为 null */
  readonly locationValue: ProvinceCitySelection | null;
  /** 未修改、且库里是旧地点或当前目录不认识的地点时，用于显示与预填 */
  readonly locationLegacy: LegacyLocation | null;
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
  readonly changeLocation: (value: ProvinceCitySelection | null) => void;
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
  // 地点的比较基准同样只取一次：页面停留期间重读到的新值不改变「用户有没有改过」。
  const [initialLocation] = useState<StoredLocation>(() => detail.location);
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
    isDirty(draft, initialDraft, initialLocation) && !saved && !saving && !changingArchive;

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

  const changeLocation = useCallback((value: ProvinceCitySelection | null) => {
    setDraft((previous) => ({ ...previous, location: { touched: true, value } }));
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
          // 只有真的改了才提交地点；没改就不传，由 service 保留库里此刻的值，
          // 页面停留期间别处对地点的修改不会被这份旧页面盖掉。
          ...(current.location.touched && locationChanged(current.location, initialLocation)
            ? { location: current.location.value }
            : {}),
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
  }, [dataAccess, detail.id, initialLocation]);

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
          // 归档与恢复不改名称、地点、备注与关联条数，因此不必重读整页，
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

  // 打开页面时库里的地点只解析一次：它只用于显示与预填，永远不会被原样写回。
  const [initialLocationView] = useState(() => describeStoredLocation(detail.location));
  const locationValue = draft.location.touched
    ? draft.location.value
    : initialLocationView.kind === 'selection'
      ? initialLocationView.selection
      : null;
  const locationLegacy =
    !draft.location.touched && initialLocationView.kind === 'legacy' ? initialLocationView.legacy : null;

  return {
    draft,
    locationValue,
    locationLegacy,
    isArchived,
    nameError,
    actionError,
    saving,
    changingArchive,
    changeName,
    changeLocation,
    changeNotes,
    submit,
    cancel,
    setArchived,
  };
}
