import { StyleSheet, View } from 'react-native';

import { BusinessDateField, InlineNotice, ProvinceCityField, TextField } from '@/components/ui';
import { PersonPicker } from '@/features/people/components/person-picker';
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
          )}。只改名称、日期、购买人、机构或备注可以直接保存；修改总价后需要在下一步补平。`}
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

      {/* 购买人不属于金额结构：只改购买人时，历史不平衡的套餐仍可保留原差额保存。 */}
      <PersonPicker
        label="购买人"
        value={draft.purchaser}
        options={form.personOptions}
        onChange={(value) => form.updateField({ purchaser: value })}
        disabled={form.saving}
        helperText="默认是自己。修改购买人不会改变任何金额"
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

      {/* 套餐不单独填城市：城市跟随所选机构（PRD 第 5B.9 节）。只有当场新增机构时才选地点，
          而且名称与已有机构相同时会复用那一家，这里选的地点不会改动它。 */}
      {draft.institutionMode === 'new' ? (
        <ProvinceCityField
          label="新机构地点"
          value={draft.newInstitutionLocation}
          onChange={(value) => form.updateField({ newInstitutionLocation: value })}
          clearable
          disabled={form.saving}
          helperText="选填。只在新建这家机构时保存；若已有同名机构，会直接使用它原来的地点。"
        />
      ) : null}

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
