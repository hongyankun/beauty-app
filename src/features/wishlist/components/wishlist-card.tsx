import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { WishlistItemSummary } from '../wishlist-view';

export type WishlistCardProps = {
  item: WishlistItemSummary;
  /** 点击整张卡片，进入这条心愿的编辑页 */
  onPress: (wishlistItemId: string) => void;
};

/**
 * 心愿单列表里的一张卡片。
 *
 * 心愿单的视觉要求是「轻松、有呼吸感」：分类标签是主要的区分手段，
 * 不用促销式强调，也没有倒计时与催促角标（UI_REFERENCE 第 13、15 章）。
 * 计划日期即使已经过去也只陈述日期事实，不加「已错过」这类评价
 * （PRD-NFR-002）。
 *
 * 选填项为空时整段省略，不铺一屏「未填写」。每一项独占一行、可自由换行，
 * 因此系统字体放到最大档时是换行而不是被截断（PRD-NFR-006）。
 *
 * 整张卡片是一个读屏节点，一次读出名称、分类、机构、计划、预算与「编辑心愿」，
 * 而不是让用户逐行听散落的碎片。
 */
export function WishlistCard({ item, onPress }: WishlistCardProps) {
  // 机构已归档时把状态说出来：归档不会清空这条关联，但用户需要知道
  // 它已经不在机构选择列表里了（PRD 第 5A.3.4 节）。
  const institutionLine =
    item.institutionName === null
      ? null
      : item.institutionIsArchived
        ? `${item.institutionName}（已归档）`
        : item.institutionName;

  const label = [
    item.name,
    item.categoryLabel,
    institutionLine,
    item.plannedOnLabel,
    item.budgetLabel,
    item.notesSummary === null ? null : `备注 ${item.notesSummary}`,
    '编辑心愿',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name}>{item.name}</Text>
          {/* 分类是选填的，没选时不占位，也不补一个「未分类」标签。 */}
          {item.categoryLabel === null ? null : (
            <View style={styles.tag}>
              <Text style={styles.tagLabel}>{item.categoryLabel}</Text>
            </View>
          )}
        </View>

        {institutionLine === null ? null : <Text style={styles.meta}>{institutionLine}</Text>}
        {item.plannedOnLabel === null ? null : (
          <Text style={styles.meta}>{item.plannedOnLabel}</Text>
        )}
        {/* 预算是这张卡上唯一的关键数值，用衬线数字（UI_REFERENCE 第 4、8.1 章）。 */}
        {item.budgetLabel === null ? null : <Text style={styles.budget}>{item.budgetLabel}</Text>}
        {item.notesSummary === null ? null : <Text style={styles.meta}>{item.notesSummary}</Text>}
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
    // 占满除分类标签以外的宽度并自由换行；标签那侧不收缩，两者不会互相挤。
    flex: 1,
  },
  tag: {
    flexShrink: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintLight,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  budget: {
    ...TextStyles.numeric,
    color: Colors.textPrimary,
  },
});
