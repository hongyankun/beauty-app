import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { RedeemableItem } from '../services/list-redeemable-items';

export type RedeemableItemCardProps = {
  item: RedeemableItem;
  /** 有效期是否已经早于今天。只作事实陈述，不影响能否选中 */
  expired: boolean;
  onPress: (item: RedeemableItem) => void;
};

/** 机构留空时的统一说法：陈述事实，不编造机构名。 */
const NO_INSTITUTION = '未填写机构';

/**
 * 快捷核销选择页的一个候选项目。
 *
 * 剩余次数做右上角标签，与记录列表的套餐卡片保持同一套扫读结构。
 * 「已过有效期」是中性文字标注，不是警示色块：过期既不清零余次，
 * 也不禁止核销（ADR-017、PRD-RED-014），因此整行照常可选。
 */
export function RedeemableItemCard({ item, expired, onPress }: RedeemableItemCardProps) {
  const institution = item.institutionName ?? NO_INSTITUTION;
  const place = item.city === null ? institution : `${institution} · ${item.city}`;

  const label = [
    item.itemName,
    `属于套餐 ${item.purchaseName}`,
    institution,
    `剩余 ${item.remaining} 次`,
    item.expiresOn === null ? null : `有效期至 ${item.expiresOn}`,
    expired ? '已过有效期' : null,
    '记录一次',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={2}>
            {item.itemName}
          </Text>
          <View style={styles.tag}>
            <Text style={styles.tagLabel}>剩余 {item.remaining} 次</Text>
          </View>
        </View>

        <Text style={styles.meta} numberOfLines={2}>
          {item.purchaseName}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {place}
        </Text>

        {item.expiresOn === null ? null : (
          <Text style={styles.meta}>
            有效期至 {item.expiresOn}
            {expired ? ' · 已过有效期' : ''}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Layout.tightGap,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  name: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
    flex: 1,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    backgroundColor: Colors.mintLight,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
