import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import type { PurchaseSummary } from '../services/list-purchases';

export type PurchaseCardProps = {
  summary: PurchaseSummary;
  /** 点击进入套餐详情。不传时卡片只做展示，不可点击 */
  onPress?: (purchaseId: string) => void;
};

/**
 * 套餐列表卡片。
 *
 * 记录 Tab 的视觉重点是「套餐名与剩余次数的对齐与可扫读」（UI_REFERENCE 第 13 章），
 * 所以名称占主标题、剩余次数做右上角状态标签、金额用衬线数字。
 *
 * 状态标签同时带文字，不靠颜色单独区分（PRD-NFR-005）：
 * 有余次用 `mintLight` 浅底，已用完按第 11 章做灰度处理而不是警示色。
 *
 * 有效期本轮只展示不参与筛选，因此这里只在有值时原样陈述日期，
 * 不计算「临期」「已过期」——那需要与筛选口径一起定义，属于后续任务。
 */
export function PurchaseCard({ summary, onPress }: PurchaseCardProps) {
  const usedUp = summary.remaining === 0;

  const meta = [
    summary.institutionName,
    summary.city,
    `${summary.itemCount} 个项目`,
    `共 ${summary.totalQuantity} 次`,
  ].filter((part): part is string => part !== null);

  const content = (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {summary.name}
        </Text>
        <View style={[styles.tag, usedUp ? styles.tagUsedUp : styles.tagActive]}>
          <Text style={[styles.tagLabel, usedUp ? styles.tagLabelUsedUp : null]}>
            {usedUp ? '已用完' : `剩余 ${summary.remaining} 次`}
          </Text>
        </View>
      </View>

      <Text style={styles.amount}>{formatMinorAsYuan(summary.totalAmountMinor)}</Text>

      <View style={styles.metaGroup}>
        <Text style={styles.meta}>{meta.join(' · ')}</Text>
        <Text style={styles.meta}>
          {summary.purchaseDate} 购买
          {summary.expiresOn === null ? '' : ` · 有效期至 ${summary.expiresOn}`}
        </Text>
      </View>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  // 整张卡片就是触控区，远超 44×44pt（UI_REFERENCE 第 14 章）。
  // 读屏标签把卡片里分散的几行信息合成一句话，否则用户要逐条划过才知道这是什么。
  return (
    <Pressable
      onPress={() => onPress(summary.id)}
      accessibilityRole="button"
      accessibilityLabel={`${summary.name}，${
        usedUp ? '已用完' : `剩余 ${summary.remaining} 次`
      }，${summary.purchaseDate} 购买，查看详情`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {content}
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
  },
  tagActive: {
    backgroundColor: Colors.mintLight,
  },
  tagUsedUp: {
    backgroundColor: Colors.backgroundWarm,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  tagLabelUsedUp: {
    color: Colors.textSecondary,
  },
  amount: {
    ...TextStyles.numeric,
    color: Colors.textPrimary,
  },
  metaGroup: {
    gap: Layout.tightGap,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
