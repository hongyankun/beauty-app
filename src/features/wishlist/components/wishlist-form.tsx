import { StyleSheet, Text, View } from 'react-native';

import { BusinessDateField, Chip, ChipRow, TextField } from '@/components/ui';
import { PURCHASE_ITEM_CATEGORY_OPTIONS } from '@/features/purchases/categories';
import { Colors, Layout, TextStyles } from '@/theme';
import type { WishlistFormController } from '../hooks/use-wishlist-form';
import { WishlistInstitutionField } from './wishlist-institution-field';

export type WishlistFormProps = {
  form: WishlistFormController;
};

/**
 * 心愿表单的字段区，**新增与编辑共用同一份**。
 *
 * 只有心愿名称必填。其余四项都是「想起来再补」的内容：用户在百科里看到一个
 * 项目想记下来时，往往还没有机构、预算和时间，强制填写只会让人放弃记录。
 *
 * 分类复用套餐项目的那一套取值（PRD 第 6.3 节），不另起一套同义分类：
 * 同一个项目在心愿里和在套餐里应该是同一个分类，将来才谈得上归并。
 */
export function WishlistForm({ form }: WishlistFormProps) {
  return (
    <View style={styles.section}>
      <TextField
        label="心愿名称"
        required
        value={form.draft.name}
        onChangeText={(value) => form.updateField({ name: value })}
        placeholder="例如 光子嫩肤"
        error={form.errors?.name}
      />

      <View style={styles.field}>
        <Text style={styles.label}>
          项目分类
          <Text style={styles.requirement}>（选填）</Text>
        </Text>
        <ChipRow accessibilityLabel="项目分类，选填，再次点击可取消选择">
          {PURCHASE_ITEM_CATEGORY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={form.draft.category === option.value}
              onPress={() => form.selectCategory(option.value)}
            />
          ))}
        </ChipRow>
      </View>

      <WishlistInstitutionField
        options={form.institutions}
        value={form.draft.institutionId}
        onSelect={form.selectInstitution}
        onClear={form.clearInstitution}
      />

      <BusinessDateField
        label="计划时间"
        clearable
        value={form.draft.plannedOn}
        onChange={(value) => form.updateField({ plannedOn: value })}
        helperText="只是自己的打算，不会产生提醒"
        error={form.errors?.plannedOn}
      />

      <TextField
        label="心理预算"
        value={form.draft.budget}
        onChangeText={(value) => form.updateField({ budget: value })}
        placeholder="例如 3000"
        hint="以元填写，最多两位小数"
        keyboardType="decimal-pad"
        error={form.errors?.budget}
      />

      <TextField
        label="备注"
        value={form.draft.notes}
        onChangeText={(value) => form.updateField({ notes: value })}
        placeholder="例如 想先了解一下恢复期"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.fieldGap,
  },
  field: {
    gap: Layout.labelGap,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  requirement: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
