import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { FormScreen, InlineNotice, Screen } from '@/components/ui';
import type { PersonPickerOption } from '@/features/people/components/person-picker';
import { usePersonOptions } from '@/features/people/hooks/use-person-options';
import {
  PurchaseForm,
  PurchaseFormFooter,
  purchaseFormStepLabel,
} from '@/features/purchases/components/purchase-form';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { usePurchaseForm } from '@/features/purchases/hooks/use-purchase-form';
import type { PurchaseDraft, PurchaseDraftInput } from '@/features/purchases/purchase-draft';
import { PurchaseServiceError } from '@/features/purchases/services/errors';
import { matchingNewPackageItemKeys } from '../event-draft';
import {
  completePackageHandoff,
  readPackageHandoff,
  type PackageHandoffRequest,
} from '../new-package-handoff';

/**
 * 「新建套餐并使用」的全屏子步骤（BT-0023 裁决 2）。
 *
 * 与新增套餐页用的是同一份两步表单、同一套草稿校验与金额分配规则（`usePurchaseForm` + `PurchaseForm`），
 * 区别只有一处：确认时**不写数据库**，而是把草稿交回「记录一次变美」，由它在同一个事务里
 * 连同变美记录一起保存。取消或返回不会留下任何数据；有改动时同样二次确认。
 *
 * 打开时已经预置了这一行的项目（BT-0023B）。可以改次数、金额，也可以按套餐规则添加其他项目；
 * 但套餐里必须保留一个与这一行项目匹配的项目，否则不能确认返回。
 */

const DISCARD_PROMPT = {
  title: '放弃这个新套餐？',
  message: '这个新套餐还没有保存，填写的内容会丢失。记录表单里的其他内容不受影响。',
  keepLabel: '继续填写',
  discardLabel: '放弃',
} as const;

export function NewEventPackageScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const people = usePersonOptions();
  // 只在挂载时读一次：它同时是「有没有改动」的比较基准。
  const [request] = useState(() => readPackageHandoff(purchaseId));

  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  if (request === null) {
    return (
      <Screen title="新建套餐并使用" onBack={cancel} backLabel="返回">
        <InlineNotice
          tone="warning"
          message="这个新套餐的草稿已经失效，请返回记录表单重新打开。"
          actionLabel="返回"
          onActionPress={cancel}
        />
      </Screen>
    );
  }

  if (people.status === 'loading') {
    return (
      <Screen title="新建套餐并使用" onBack={cancel} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在准备表单" />
      </Screen>
    );
  }

  if (people.result === null) {
    return (
      <Screen title="新建套餐并使用" onBack={cancel} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取使用人，暂时无法新建套餐。"
          actionLabel="重试"
          onActionPress={people.reload}
        />
      </Screen>
    );
  }

  return (
    <EventPackageForm purchaseId={purchaseId} request={request} personOptions={people.result.options} />
  );
}

type EventPackageFormProps = {
  readonly purchaseId: string;
  readonly request: PackageHandoffRequest;
  readonly personOptions: readonly PersonPickerOption[];
};

function EventPackageForm({ purchaseId, request, personOptions }: EventPackageFormProps) {
  const router = useRouter();
  const { initial: initialDraft, requiredService, requiredName } = request;

  const handleSave = useCallback(
    async (input: PurchaseDraftInput, draft: PurchaseDraft) => {
      // 套餐里必须保留一个与这一行项目匹配的项目：删掉或换掉它，就不能确认返回。
      if (matchingNewPackageItemKeys(requiredService, draft).length === 0) {
        throw new PurchaseServiceError(
          `套餐里需要保留一个与本次项目「${requiredName}」相同的项目，才能用它记录这一次。`,
        );
      }
      if (!completePackageHandoff(purchaseId, draft, input)) {
        throw new PurchaseServiceError('记录表单已经关闭，这个新套餐无法交回，请重新记录一次。');
      }
    },
    [purchaseId, requiredService, requiredName],
  );

  const handleSaved = useCallback(() => {
    router.back();
  }, [router]);

  const form = usePurchaseForm({
    initialDraft,
    onSave: handleSave,
    onSaved: handleSaved,
    saveErrorFallback: '没能使用这个新套餐，请重试。你填写的内容都还在。',
    discard: DISCARD_PROMPT,
    personOptions,
  });

  return (
    <FormScreen
      title="新建套餐并使用"
      subtitle={`${purchaseFormStepLabel(form)}：${
        form.step === 1 ? '填写套餐信息与总价' : '添加项目并分配金额'
      }。确认后回到记录表单，随记录一起保存`}
      onCancel={form.cancel}
      footer={<PurchaseFormFooter form={form} saveLabel="使用这个套餐" />}
    >
      {form.saveError ? <InlineNotice tone="warning" message={form.saveError} /> : null}
      <PurchaseForm
        form={form}
        itemsHint={`已预置本次项目「${requiredName}」，需要保留它；也可以添加其他项目。保存记录时才会真正新建这个套餐。`}
      />
    </FormScreen>
  );
}
