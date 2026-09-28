import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { FormScreen, InlineNotice, Screen } from '@/components/ui';
import type { PersonPickerOption } from '@/features/people/components/person-picker';
import { usePersonOptions } from '@/features/people/hooks/use-person-options';
import { useDataAccess } from '@/hooks/use-data-access';
import { todayBusinessDate } from '@/utils/business-date';
import { createUuid } from '@/utils/uuid';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import {
  PurchaseForm,
  PurchaseFormFooter,
  purchaseFormStepLabel,
} from '../components/purchase-form';
import { usePurchaseForm } from '../hooks/use-purchase-form';
import { createInitialDraft, type PurchaserDraft, type PurchaseDraftInput } from '../purchase-draft';
import { createPurchase } from '../services/create-purchase';

/**
 * 新增购买记录（全屏表单，覆盖 Tab 栏）。
 *
 * 字段、校验、提交闸门与返回拦截都来自与编辑页共用的 `usePurchaseForm` +
 * `PurchaseForm`；这里只决定初值、保存调哪个 service、成功后去哪
 * （ARCHITECTURE 第三节的分层）。
 *
 * 购买人必填、默认「自己」（PRD 第 5B.4 节）。「自己」的 ID 要从库里读，
 * 所以先读使用人选项，读到后才挂载表单：初值一次定好，「有没有改动」的比较基准才稳定。
 */

/** 放在模块级：文案不随状态变化，没必要每次渲染新建一个对象。 */
const DISCARD_PROMPT = {
  title: '放弃这条购买记录？',
  message: '已经填写的内容不会被保存。',
  keepLabel: '继续填写',
  discardLabel: '放弃',
} as const;

export function NewPurchaseScreen() {
  const router = useRouter();
  const people = usePersonOptions();

  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  if (people.status === 'loading') {
    return (
      <Screen title="新增购买记录" onBack={cancel} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在准备表单" />
      </Screen>
    );
  }

  if (people.result === null) {
    return (
      <Screen title="新增购买记录" onBack={cancel} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取使用人，暂时无法新增套餐。"
          actionLabel="重试"
          onActionPress={people.reload}
        />
      </Screen>
    );
  }

  return (
    <NewPurchaseForm
      self={{ id: people.result.selfId, name: people.result.selfName, isArchived: false }}
      personOptions={people.result.options}
    />
  );
}

type NewPurchaseFormProps = {
  readonly self: PurchaserDraft;
  readonly personOptions: readonly PersonPickerOption[];
};

function NewPurchaseForm({ self, personOptions }: NewPurchaseFormProps) {
  const router = useRouter();
  const dataAccess = useDataAccess();

  // 只在挂载时算一次：购买日期默认今天，购买人默认「自己」，项目区默认给一行空项目（IA 第 3.6.1 节）。
  // 用 state 初始化函数而不是 useMemo：父组件每次渲染都会新建 `self` 对象，
  // 跟着它重算会冲掉「有没有改动」的比较基准。
  const [initialDraft] = useState(() =>
    createInitialDraft(todayBusinessDate(), createUuid(), self),
  );

  const handleSave = useCallback(
    async (input: PurchaseDraftInput) => {
      await createPurchase(dataAccess, input);
    },
    [dataAccess],
  );

  const handleSaved = useCallback(() => {
    // 购买记录详情页尚未实现，先回到记录列表；列表在获得焦点时会刷新。
    // 用 dismissTo 而不是 replace：replace 会把表单这一层换成第二个 (tabs) 入口，
    // 根 Stack 里就会同时存在两份 Tab 导航。dismissTo 是把表单弹掉、回到已有的那份。
    if (router.canDismiss()) {
      router.dismissTo('/(tabs)/records');
    } else {
      router.replace('/(tabs)/records');
    }
  }, [router]);

  const form = usePurchaseForm({
    initialDraft,
    onSave: handleSave,
    onSaved: handleSaved,
    saveErrorFallback: '没能保存这条购买记录，请重试。你填写的内容都还在。',
    discard: DISCARD_PROMPT,
    personOptions,
  });

  return (
    <FormScreen
      title="新增购买记录"
      subtitle={`${purchaseFormStepLabel(form)}：${
        form.step === 1 ? '填写套餐信息与总价' : '添加项目并分配金额'
      }`}
      onCancel={form.cancel}
      footer={<PurchaseFormFooter form={form} saveLabel="保存套餐" />}
    >
      {form.saveError ? <InlineNotice tone="warning" message={form.saveError} /> : null}

      <PurchaseForm form={form} itemsHint="至少需要一个项目。" />
    </FormScreen>
  );
}
