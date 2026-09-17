import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { Button, FormScreen, InlineNotice } from '@/components/ui';
import { useDataAccess } from '@/hooks/use-data-access';
import { todayBusinessDate } from '@/utils/business-date';
import { createUuid } from '@/utils/uuid';
import { PurchaseForm } from '../components/purchase-form';
import { usePurchaseForm } from '../hooks/use-purchase-form';
import { createInitialDraft, type PurchaseDraftInput } from '../purchase-draft';
import { createPurchase } from '../services/create-purchase';

/**
 * 新增购买记录（全屏表单，覆盖 Tab 栏）。
 *
 * 字段、校验、提交闸门与返回拦截都来自与编辑页共用的 `usePurchaseForm` +
 * `PurchaseForm`；这里只决定初值、保存调哪个 service、成功后去哪
 * （ARCHITECTURE 第三节的分层）。
 */

/** 放在模块级：它是 `beforeRemove` 监听的依赖，每次渲染新建一个会让监听反复重挂。 */
const DISCARD_PROMPT = {
  title: '放弃这条购买记录？',
  message: '已经填写的内容不会被保存。',
  keepLabel: '继续填写',
  discardLabel: '放弃',
} as const;

export function NewPurchaseScreen() {
  const router = useRouter();
  const dataAccess = useDataAccess();

  // 只在挂载时算一次：购买日期默认今天，项目区默认给一行空项目（IA 第 3.6.1 节）。
  const initialDraft = useMemo(() => createInitialDraft(todayBusinessDate(), createUuid()), []);

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
  });

  return (
    <FormScreen
      title="新增购买记录"
      subtitle="记录一次购买，以及它包含的项目。"
      onCancel={form.cancel}
      footer={
        <Button
          label={form.saving ? '正在保存…' : '保存套餐'}
          variant="primary"
          loading={form.saving}
          onPress={form.submit}
          accessibilityLabel="保存套餐"
        />
      }
    >
      {form.saveError ? <InlineNotice tone="warning" message={form.saveError} /> : null}

      <PurchaseForm form={form} itemsHint="至少需要一个项目。" />
    </FormScreen>
  );
}
