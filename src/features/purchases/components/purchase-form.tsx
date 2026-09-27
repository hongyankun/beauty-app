import { Button } from '@/components/ui';
import type { PurchaseFormController } from '../hooks/use-purchase-form';
import { PurchaseInfoStep } from './purchase-info-step';
import type { PurchaseItemEditorContext } from './purchase-item-editor';
import { PurchaseItemsStep } from './purchase-items-step';

export type PurchaseFormProps = {
  /** `usePurchaseForm` 的返回值，状态与处理函数都从这里来 */
  form: PurchaseFormController;
  /** 项目区标题下方的一行说明 */
  itemsHint: string;
  /** 既有项目的核销事实，以草稿 key 为索引；新增流程不传 */
  itemContext?: Readonly<Record<string, PurchaseItemEditorContext>>;
};

/**
 * 套餐表单的步骤编排，新增页与编辑页共用同一份（PRD 第 5B.6 节）。
 *
 * 第一步是套餐信息与总价，第二步是项目与金额分配。两步共用同一份草稿，
 * 切换步骤只换渲染的那一半，不清空也不重建任何字段。
 *
 * 这里不含任何保存逻辑：校验、提交闸门与返回拦截都在 `usePurchaseForm`，
 * 写库在 service。页面各自持有 `FormScreen` 与导航。
 */
export function PurchaseForm({ form, itemsHint, itemContext }: PurchaseFormProps) {
  if (form.step === 1) {
    return <PurchaseInfoStep form={form} />;
  }
  return <PurchaseItemsStep form={form} itemsHint={itemsHint} itemContext={itemContext} />;
}

/** 当前是第几步，放在页面副标题里。 */
export function purchaseFormStepLabel(form: PurchaseFormController): string {
  return `第 ${form.step} 步，共 2 步`;
}

export type PurchaseFormFooterProps = {
  form: PurchaseFormController;
  /** 第二步主按钮的文案：新增为「保存套餐」，编辑为「保存修改」 */
  saveLabel: string;
};

/**
 * 底部操作区。每一步只有一个实心主按钮（docs/UI_REFERENCE.md）：
 * 第一步是「下一步：添加项目」，第二步是保存；「返回套餐信息」是次按钮。
 *
 * 保存进行中两个按钮都禁用：回到第一步再改字段，会让正在写入的内容与屏幕上的不一致。
 */
export function PurchaseFormFooter({ form, saveLabel }: PurchaseFormFooterProps) {
  if (form.step === 1) {
    return <Button label="下一步：添加项目" variant="primary" onPress={form.goNext} />;
  }

  return (
    <>
      <Button
        label={form.saving ? '正在保存…' : saveLabel}
        variant="primary"
        loading={form.saving}
        onPress={form.submit}
        accessibilityLabel={saveLabel}
      />
      <Button label="返回套餐信息" onPress={form.goBack} disabled={form.saving} />
    </>
  );
}
