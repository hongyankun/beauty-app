import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDataAccess } from '@/hooks/use-data-access';
import { createPerson } from '../services/create-person';
import { deletePerson } from '../services/delete-person';
import { toUserMessage } from '../services/errors';
import type { PersonSummary } from '../services/person-view';
import { setPersonArchived } from '../services/set-person-archived';
import { updatePerson } from '../services/update-person';

/**
 * 新增与编辑使用人共用的表单状态。
 *
 * `detail` 为 null 时是新增，否则是编辑已有的人。「自己」的编辑页只读，
 * 页面不会调用这里的写操作；service 仍会再拦一次（PRD-PERSON-001）。
 * 这里不写 SQL：落库全部发生在 service 层（ARCHITECTURE 第三节）。
 */

const DISCARD_PROMPT = {
  title: '放弃本次修改？',
  message: '刚才填写的内容不会被保存。',
  keepLabel: '继续编辑',
  discardLabel: '放弃修改',
} as const;

const CREATE_FALLBACK = '没能添加这个人，请重试。你填写的内容都还在。';
const SAVE_FALLBACK = '没能保存这次修改，请重试。你填写的内容都还在。';
const ARCHIVE_FALLBACK = '没能归档，请重试。';
const RESTORE_FALLBACK = '没能恢复，请重试。';
const DELETE_FALLBACK = '没能删除，请重试。';

export type PersonEditorController = {
  readonly name: string;
  readonly isArchived: boolean;
  readonly nameError: string | null;
  readonly actionError: string | null;
  readonly saving: boolean;
  /** 归档、恢复或删除进行中 */
  readonly changingStatus: boolean;
  readonly changeName: (value: string) => void;
  readonly submit: () => void;
  readonly cancel: () => void;
  /** 确认弹窗由页面负责，这里只执行 */
  readonly setArchived: (nextArchived: boolean) => void;
  readonly remove: () => void;
};

export function usePersonEditor(detail: PersonSummary | null): PersonEditorController {
  const router = useRouter();
  const navigation = useNavigation();
  const dataAccess = useDataAccess();

  const [initialName] = useState(() => detail?.name ?? '');
  const [name, setName] = useState(initialName);
  const [isArchived, setIsArchived] = useState(detail?.isArchived ?? false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  /** 保存、归档、恢复与删除共用一个闸门：都写同一行，不该同时在飞，连点只执行一次。 */
  const busy = useRef(false);
  /** 保存或删除成功后直接离开，不再弹放弃确认。必须是 state：拦截开关在渲染期读取。 */
  const [finished, setFinished] = useState(false);

  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  });

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me/people');
    }
  }, [router]);

  const preventRemove = name !== initialName && !finished && !saving && !changingStatus;

  usePreventRemove(preventRemove, ({ data }) => {
    Alert.alert(DISCARD_PROMPT.title, DISCARD_PROMPT.message, [
      { text: DISCARD_PROMPT.keepLabel, style: 'cancel' },
      {
        text: DISCARD_PROMPT.discardLabel,
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  useEffect(() => {
    if (finished) {
      goBack();
    }
  }, [finished, goBack]);

  const changeName = useCallback((value: string) => {
    setName(value);
    setNameError(null);
  }, []);

  const submit = useCallback(() => {
    if (busy.current) {
      return;
    }
    const current = nameRef.current;
    if (current.trim() === '') {
      // 本地先拦一道，service 层仍会再校验一次。
      setNameError('请填写名称');
      setActionError('还有一处需要修改，请检查下方标红的内容。');
      return;
    }

    busy.current = true;
    setNameError(null);
    setActionError(null);
    setSaving(true);

    void (async () => {
      try {
        if (detail === null) {
          await createPerson(dataAccess, current);
        } else {
          await updatePerson(dataAccess, detail.id, current);
        }
        // 不复位闸门：页面即将离开，复位只会给第二次点击留出空档。
        setFinished(true);
      } catch (error) {
        setActionError(toUserMessage(error, detail === null ? CREATE_FALLBACK : SAVE_FALLBACK));
        busy.current = false;
        setSaving(false);
      }
    })();
  }, [dataAccess, detail]);

  const cancel = useCallback(() => {
    goBack();
  }, [goBack]);

  const setArchived = useCallback(
    (nextArchived: boolean) => {
      if (busy.current || detail === null) {
        return;
      }
      busy.current = true;
      setActionError(null);
      setChangingStatus(true);

      void (async () => {
        try {
          await setPersonArchived(dataAccess, detail.id, nextArchived);
          setIsArchived(nextArchived);
        } catch (error) {
          setActionError(toUserMessage(error, nextArchived ? ARCHIVE_FALLBACK : RESTORE_FALLBACK));
        } finally {
          busy.current = false;
          setChangingStatus(false);
        }
      })();
    },
    [dataAccess, detail],
  );

  const remove = useCallback(() => {
    if (busy.current || detail === null) {
      return;
    }
    busy.current = true;
    setActionError(null);
    setChangingStatus(true);

    void (async () => {
      try {
        await deletePerson(dataAccess, detail.id);
        setFinished(true);
      } catch (error) {
        setActionError(toUserMessage(error, DELETE_FALLBACK));
        busy.current = false;
        setChangingStatus(false);
      }
    })();
  }, [dataAccess, detail]);

  return {
    name,
    isArchived,
    nameError,
    actionError,
    saving,
    changingStatus,
    changeName,
    submit,
    cancel,
    setArchived,
    remove,
  };
}
