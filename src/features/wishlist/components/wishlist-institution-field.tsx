import { StyleSheet, Text, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import type { WishlistInstitutionOption } from '../services/list-institution-options';

export type WishlistInstitutionFieldProps = {
  options: readonly WishlistInstitutionOption[];
  /** 当前选中的机构；null 表示不关联 */
  value: string | null;
  onSelect: (institutionId: string) => void;
  onClear: () => void;
};

/**
 * 心愿的意向机构：**只能从已有机构里选，不能当场新增**。
 *
 * 与套餐、核销的机构选择器刻意不同。那两处是「事情已经发生在某家机构」，
 * 用户必须能把当时那家写下来，所以是可搜索选择器 + 当场新增（PRD 第 5A.2 节）；
 * 心愿只是「以后也许想去」，为一个还没发生的打算凭空建一条机构主数据，
 * 会让机构管理里堆满从未产生过任何记录的空机构。
 *
 * 用 Chip 组而不是下拉菜单：候选来自用户自己用过的机构，数量有限，
 * 平铺出来一眼能看完，也不需要额外的弹层（与项目分类同一形态）。
 * 「不关联机构」是一个明确的选项而不是「什么都不点」，用户才知道空着是允许的。
 */
export function WishlistInstitutionField({
  options,
  value,
  onSelect,
  onClear,
}: WishlistInstitutionFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        意向机构
        <Text style={styles.requirement}>（选填）</Text>
      </Text>

      <ChipRow accessibilityLabel="意向机构，选填，只能选择已有机构">
        <Chip label="不关联机构" selected={value === null} onPress={onClear} />
        {options.map((option) => (
          <Chip
            key={option.id}
            // 已归档的机构只有在这条心愿原本就关联着它时才会出现；
            // 状态写在标签文字里，不靠颜色单独表达（PRD-NFR-005）。
            label={option.isArchived ? `${option.name}（已归档）` : option.name}
            selected={value === option.id}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </ChipRow>

      <Text style={styles.hint}>
        {options.length === 0
          ? '还没有可选的机构。机构在新增套餐或记录核销时创建，之后就能在这里选。'
          : '只能选择已有机构。新的机构在新增套餐或记录核销时创建。'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
