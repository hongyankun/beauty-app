import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import type { HomeRecentRedemption } from '../services/get-home-dashboard';

export type RecentRedemptionCardProps = {
  redemption: HomeRecentRedemption;
  /** 点击进入这条记录所属的套餐详情 */
  onPress: (purchaseId: string) => void;
};

/** 机构留空时的统一说法：陈述事实，不编造机构名。 */
const NO_INSTITUTION = '未填写机构';

/**
 * 首页「最近记录」的一行。
 *
 * 一行同时回答「做了什么」「属于哪个套餐」「什么时候」「在哪」四件事，
 * 整行可点，点进对应套餐详情（IA 第 3.2.2 节：首页最近记录是详情页的入口之一）。
 */
export function RecentRedemptionCard({ redemption, onPress }: RecentRedemptionCardProps) {
  const institution = redemption.institutionName ?? NO_INSTITUTION;
  // 城市快照为空时整段省略，不留「· 」这种空壳（IA 第 3.4.2 节：选填字段为空时不展示该行）。
  const place = redemption.city === null ? institution : `${institution} · ${redemption.city}`;

  // 读屏把分散的几行合成一句话，否则用户要逐条划过才知道这是什么。
  const label = [
    redemption.itemName,
    `属于套餐 ${redemption.purchaseName}`,
    `${redemption.redeemedOn} 记录`,
    redemption.institutionName ?? NO_INSTITUTION,
    redemption.city,
    '查看套餐详情',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(redemption.purchaseId)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={2}>
            {redemption.itemName}
          </Text>
          <Text style={styles.date}>{redemption.redeemedOn}</Text>
        </View>
        <Text style={styles.meta} numberOfLines={2}>
          {redemption.purchaseName}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {place}
        </Text>
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
  date: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
