import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { Button, EmptyState, FormScreen, InlineNotice, Screen } from '@/components/ui';
import { useDataAccess } from '@/hooks/use-data-access';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { PurchaseForm } from '../components/purchase-form';
import type { PurchaseItemEditorContext } from '../components/purchase-item-editor';
import { usePurchaseEditModel } from '../hooks/use-purchase-edit-model';
import { usePurchaseForm } from '../hooks/use-purchase-form';
import { createDraftFromEdit, type PurchaseDraftInput } from '../purchase-draft';
import type { PurchaseEditModel } from '../services/get-purchase-for-edit';
import { updatePurchase } from '../services/update-purchase';

/**
 * 编辑套餐（全屏表单，覆盖 Tab 栏；IA 第 3.6.2 节）。
 *
 * 表单本体与新增页共用 `usePurchaseForm` + `PurchaseForm`，这里只多做三件事：
 * 初值从数据库读、次数下限传给校验、删除项目要按核销历史区别对待。
 *
 * 页面不执行 SQL、不 import expo-sqlite：读取走 `getPurchaseForEdit`，
 * 保存走 `updatePurchase`（ARCHITECTURE 第三节）。
 */

/** 放在模块级：文案不随状态变化，没必要每次渲染新建一个对象。 */
const DISCARD_PROMPT = {
  title: '放弃本次修改？',
  message: '刚才改动的内容不会被保存。',
  keepLabel: '继续编辑',
  discardLabel: '放弃修改',
} as const;

export function EditPurchaseScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const { status, model, reload } = usePurchaseEditModel(purchaseId);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/(tabs)/records/[purchaseId]', params: { purchaseId } });
  }, [router, purchaseId]);

  if (status === 'loading') {
    return (
      <Screen title="编辑套餐" onBack={goBack} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在载入这个套餐" />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="编辑套餐" onBack={goBack} backLabel="取消">
        <EmptyState
          icon="inbox"
          title="找不到这个套餐"
          description="它可能已经被删除了。返回列表看看其他套餐。"
          actionLabel="返回"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (model === null) {
    return (
      <Screen title="编辑套餐" onBack={goBack} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取这个套餐，暂时无法编辑。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  // 载入成功后才挂载表单，并用套餐 ID 作为 key：这样 `initialDraft` 可以在表单
  // 自己的生命周期里只算一次，「有没有改动」的比较基准才是稳定的。
  return <EditPurchaseForm key={model.id} model={model} />;
}

function EditPurchaseForm({ model }: { model: PurchaseEditModel }) {
  const router = useRouter();
  const dataAccess = useDataAccess();

  const initialDraft = useMemo(() => createDraftFromEdit(model), [model]);
  /** 用户已确认要从套餐里移除的既有项目 ID。 */
  const [removedItemIds, setRemovedItemIds] = useState<readonly string[]>([]);

  // 草稿的 key 对既有项目就是项目 ID，所以这两张表可以直接按 key 索引。
  const minQuantityByKey = useMemo(
    () => Object.fromEntries(model.items.map((item) => [item.id, item.redeemedCount])),
    [model],
  );
  const itemContext = useMemo<Record<string, PurchaseItemEditorContext>>(
    () =>
      Object.fromEntries(
        model.items.map((item) => [
          item.id,
          {
            redeemedCount: item.redeemedCount,
            hasRedemptionHistory: item.hasRedemptionHistory,
          },
        ]),
      ),
    [model],
  );

  const handleSave = useCallback(
    async (input: PurchaseDraftInput) => {
      await updatePurchase(dataAccess, {
        purchaseId: model.id,
        name: input.name,
        institution: input.institution,
        city: input.city,
        purchaseDate: input.purchaseDate,
        totalAmountMinor: input.totalAmountMinor,
        expiresOn: input.expiresOn,
        notes: input.notes,
        items: input.items,
        removedItemIds,
      });
    },
    [dataAccess, model.id, removedItemIds],
  );

  const handleSaved = useCallback(() => {
    // 回到这个套餐的详情页，它在获得焦点时会重读，展示的就是刚保存的内容。
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/(tabs)/records/[purchaseId]',
      params: { purchaseId: model.id },
    });
  }, [router, model.id]);

  const form = usePurchaseForm({
    initialDraft,
    onSave: handleSave,
    onSaved: handleSaved,
    saveErrorFallback: '没能保存这次修改，请重试。你改动的内容都还在。',
    discard: DISCARD_PROMPT,
    minQuantityByKey,
  });

  const { removeItem } = form;

  /**
   * 删除一个项目。三种情况，三种结果：
   *
   * 1. 本次新增、还没保存过的行 —— 直接去掉，没有什么需要确认的。
   * 2. 有过核销历史的既有项目 —— 说明原因并拒绝。已撤销的核销也算历史，
   *    它同样是用户的记录，不能因为编辑套餐被顺手清掉（ADR-018）。
   * 3. 没有任何核销历史的既有项目 —— 二次确认后移除，保存时才真正落库。
   */
  const handleItemRemove = useCallback(
    (key: string) => {
      const draftItem = form.draft.items.find((item) => item.key === key);
      if (draftItem === undefined) {
        return;
      }

      const purchaseItemId = draftItem.purchaseItemId;
      if (purchaseItemId === null) {
        removeItem(key);
        return;
      }

      const context = itemContext[key];
      if (context?.hasRedemptionHistory === true) {
        Alert.alert(
          '这个项目不能删除',
          '这个项目已有核销历史，不能从套餐中删除。你仍可以修改项目名称、分类、次数、金额和备注。',
          [{ text: '知道了', style: 'cancel' }],
        );
        return;
      }

      const name = draftItem.name.trim() === '' ? '这个项目' : draftItem.name.trim();
      Alert.alert(
        `从套餐中删除「${name}」？`,
        '保存后这个项目会从套餐里永久移除，无法恢复。在保存之前你还可以放弃本次修改。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除项目',
            style: 'destructive',
            onPress: () => {
              removeItem(key);
              setRemovedItemIds((previous) =>
                previous.includes(purchaseItemId) ? previous : [...previous, purchaseItemId],
              );
            },
          },
        ],
      );
    },
    [form.draft.items, itemContext, removeItem],
  );

  // 删除要走上面的确认流程，所以这里换掉 controller 自带的 removeItem。
  const formWithGuardedRemove = useMemo(
    () => ({ ...form, removeItem: handleItemRemove }),
    [form, handleItemRemove],
  );

  return (
    <FormScreen
      title="编辑套餐"
      subtitle="修改套餐信息与包含的项目。"
      onCancel={form.cancel}
      footer={
        <Button
          label={form.saving ? '正在保存…' : '保存修改'}
          variant="primary"
          loading={form.saving}
          onPress={form.submit}
          accessibilityLabel="保存修改"
        />
      }
    >
      {form.saveError ? <InlineNotice tone="warning" message={form.saveError} /> : null}

      <PurchaseForm
        form={formWithGuardedRemove}
        itemsHint="至少需要一个项目。已有核销记录的项目不能删除，但可以修改。"
        itemContext={itemContext}
      />
    </FormScreen>
  );
}
