import { StyleSheet, Text, View } from 'react-native';

import { Button, InlineNotice } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import type { PurchaseFormController } from '../hooks/use-purchase-form';
import { allocationGapMessage } from '../services/purchase-allocation';
import { PurchaseAllocationSummary } from './purchase-allocation-summary';
import { PurchaseItemEditor, type PurchaseItemEditorContext } from './purchase-item-editor';

export type PurchaseItemsStepProps = {
  form: PurchaseFormController;
  /** 项目区标题下方的一行说明 */
  itemsHint: string;
  /** 既有项目的核销事实，以草稿 key 为索引；新增流程不传 */
  itemContext?: Readonly<Record<string, PurchaseItemEditorContext>>;
};

/**
 * 第二步：项目列表、增删与金额分配。
 *
 * 摘要卡片放在项目列表之上，用户一边填一边就能看到还差多少；
 * 编辑一个历史不平衡的套餐时，另有一条提示说明原差额能不能保留。
 */
export function PurchaseItemsStep({ form, itemsHint, itemContext }: PurchaseItemsStepProps) {
  const { draft, errors, historicalGap } = form;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>套餐包含的项目</Text>
      <Text style={styles.sectionHint}>{itemsHint}</Text>

      {historicalGap === null ? null : historicalGap.structureChanged ? (
        <InlineNotice
          tone="warning"
          message={`这个套餐原本的金额分配与总价不一致（${allocationGapMessage(
            historicalGap.original,
          )}）。本次修改了总价、次数、分配金额或项目，需要先补平再保存。`}
        />
      ) : (
        <InlineNotice
          tone="neutral"
          message={`金额分配与总价不一致：${allocationGapMessage(
            historicalGap.original,
          )}。历史金额尚未平衡，本次未修改金额结构，可继续保存。`}
        />
      )}

      <PurchaseAllocationSummary allocation={form.allocation} />

      {errors?.itemList ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errors.itemList}
        </Text>
      ) : null}

      {draft.items.map((item, index) => (
        <PurchaseItemEditor
          key={item.key}
          item={item}
          position={index + 1}
          errors={errors?.items[item.key]}
          context={itemContext?.[item.key]}
          onChange={form.changeItem}
          onRemove={form.removeItem}
          // 最后一个项目不提供删除入口：套餐至少要留一个项目（PRD-PUR-003）。
          removable={draft.items.length > 1}
        />
      ))}

      <Button label="添加一个项目" icon="plus" onPress={form.addItem} disabled={form.saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.fieldGap,
  },
  sectionTitle: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  sectionHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    marginTop: -Layout.cardGap,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
});
