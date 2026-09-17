import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, TextField } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import type { PurchaseFormController } from '../hooks/use-purchase-form';
import { InstitutionPicker } from './institution-picker';
import { PurchaseItemEditor, type PurchaseItemEditorContext } from './purchase-item-editor';

export type PurchaseFormProps = {
  /** `usePurchaseForm` 的返回值，状态与处理函数都从这里来 */
  form: PurchaseFormController;
  /** 项目区标题下方的一行说明 */
  itemsHint: string;
  /** 既有项目的核销事实，以草稿 key 为索引；新增流程不传 */
  itemContext?: Readonly<Record<string, PurchaseItemEditorContext>>;
};

/**
 * 套餐表单的字段区，新增页与编辑页共用同一份。
 *
 * 只负责渲染：字段顺序、标签、提示语、分摊合计卡片都在这里定稿，两边一致。
 * 页面各自持有 `FormScreen`（标题、取消、底部主按钮）与导航，
 * 因为那三样正是两个流程真正不同的地方。
 */
export function PurchaseForm({ form, itemsHint, itemContext }: PurchaseFormProps) {
  const { draft, errors } = form;

  return (
    <>
      <View style={styles.section}>
        <TextField
          label="套餐名称"
          required
          value={draft.name}
          onChangeText={(value) => form.updateField({ name: value })}
          placeholder="例如 秋季紧致套餐"
          error={errors?.name}
        />

        <TextField
          label="购买日期"
          required
          value={draft.purchaseDate}
          onChangeText={(value) => form.updateField({ purchaseDate: value })}
          placeholder="2026-09-15"
          hint="按 YYYY-MM-DD 填写"
          keyboardType="numbers-and-punctuation"
          error={errors?.purchaseDate}
        />

        <InstitutionPicker
          options={form.institutions}
          mode={draft.institutionMode}
          institutionId={draft.institutionId}
          query={draft.institutionQuery}
          error={errors?.institution}
          onQueryChange={form.changeInstitutionQuery}
          onSelectExisting={form.selectInstitution}
          onClear={form.clearInstitution}
        />

        <TextField
          label="城市"
          value={draft.city}
          onChangeText={(value) => form.updateField({ city: value })}
          placeholder="例如 上海"
        />

        <TextField
          label="套餐总价"
          required
          value={draft.totalAmount}
          onChangeText={(value) => form.updateField({ totalAmount: value })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          hint="单位为元"
          error={errors?.totalAmount}
        />

        <TextField
          label="有效期"
          value={draft.expiresOn}
          onChangeText={(value) => form.updateField({ expiresOn: value })}
          placeholder="2027-09-15"
          hint="留空表示未知或长期有效"
          keyboardType="numbers-and-punctuation"
          error={errors?.expiresOn}
        />

        <TextField
          label="备注"
          value={draft.notes}
          onChangeText={(value) => form.updateField({ notes: value })}
          placeholder="例如 与朋友一起购买的双人套餐"
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>套餐包含的项目</Text>
        <Text style={styles.sectionHint}>{itemsHint}</Text>

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

        <Button label="添加一个项目" icon="plus" onPress={form.addItem} />

        {form.allocatedMinor === null ? null : (
          <Card>
            <Text style={styles.allocationLabel}>项目分摊合计</Text>
            <Text style={styles.allocationValue}>{formatMinorAsYuan(form.allocatedMinor)}</Text>
            <Text style={styles.allocationHint}>
              分摊合计与套餐总价可以不同，折扣与赠送都会造成差额。
            </Text>
          </Card>
        )}
      </View>
    </>
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
  allocationLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
  },
  allocationValue: {
    ...TextStyles.numeric,
    color: Colors.textPrimary,
    marginTop: Layout.tightGap,
  },
  allocationHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    marginTop: Layout.tightGap,
  },
});
