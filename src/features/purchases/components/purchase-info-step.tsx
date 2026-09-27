import { StyleSheet, View } from 'react-native';

import { BusinessDateField, InlineNotice, TextField } from '@/components/ui';
import { Layout } from '@/theme';
import type { PurchaseFormController } from '../hooks/use-purchase-form';
import { allocationGapMessage } from '../services/purchase-allocation';
import { InstitutionPicker } from './institution-picker';

export type PurchaseInfoStepProps = {
  form: PurchaseFormController;
};

/**
 * 第一步：套餐基本信息与总价。
 *
 * 总价放在这一步，是因为第二步的分配摘要以它为基准；先定总价再分配，
 * 用户不会一边分一边回头改总价。
 */
export function PurchaseInfoStep({ form }: PurchaseInfoStepProps) {
  const { draft, errors } = form;

  return (
    <View style={styles.section}>
      {/* 修改总价会改变金额结构，所以在填总价的这一步就先说清楚原差额。 */}
      {form.historicalGap === null ? null : (
        <InlineNotice
          tone="neutral"
          message={`这个套餐原本的金额分配与总价不一致：${allocationGapMessage(
            form.historicalGap.original,
          )}。只改名称、日期、机构或备注可以直接保存；修改总价后需要在下一步补平。`}
        />
      )}

      <TextField
        label="套餐名称"
        required
        value={draft.name}
        onChangeText={(value) => form.updateField({ name: value })}
        placeholder="例如 秋季紧致套餐"
        error={errors?.name}
      />

      <BusinessDateField
        label="购买日期"
        required
        value={draft.purchaseDate}
        onChange={(value) => form.updateField({ purchaseDate: value })}
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
        hint="单位为元。下一步会把总价分配到各个项目"
        error={errors?.totalAmount}
      />

      {/* 最早日期只是选择器上的提示，「有效期不能早于购买日期」仍由草稿校验与 service 把关；
          改购买日期不会顺带改有效期。 */}
      <BusinessDateField
        label="有效期"
        clearable
        value={draft.expiresOn}
        onChange={(value) => form.updateField({ expiresOn: value })}
        helperText="不填表示未知或长期有效"
        minimumDate={draft.purchaseDate}
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
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.fieldGap,
  },
});
