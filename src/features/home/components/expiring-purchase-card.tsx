import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { ExpiringPurchase } from '../services/list-expiring-purchases';

export type ExpiringPurchaseCardProps = {
  purchase: ExpiringPurchase;
  onPress: (purchaseId: string) => void;
};

/**
 * 临期提醒卡片。
 *
 * 状态药丸自带完整文案与日期（「今天到期 · 2026-09-18」），不靠颜色单独表达
 * （PRD-NFR-005、任务书第六节）。临期用 `coralLight` 浅底 + `coral` 描边，
 * 已过期按 UI_REFERENCE 第 11 章做灰度处理，都不用大面积饱和色块。
 *
 * 已过期照样可以点进去，也照样能继续核销：有效期不清零余次，也不禁用入口
 * （ADR-017、PRD-RED-014）。这里只陈述日期事实，不出现「不可使用」这类说法。
 *
 * 药丸单独占一行而不是挤在标题右侧：最大字号下它会变得很长，
 * 与套餐名争同一行只会互相挤压或遮挡（任务书第十三节）。
 */
export function ExpiringPurchaseCard({ purchase, onPress }: ExpiringPurchaseCardProps) {
  const expired = purchase.status === 'expired';
  const place =
    purchase.city === null
      ? purchase.institutionLabel
      : `${purchase.institutionLabel} · ${purchase.city}`;

  const label = [
    purchase.name,
    place,
    purchase.statusLabel,
    `有效期 ${purchase.expiresOn}`,
    `剩余 ${purchase.remaining} 次`,
    '查看套餐详情',
  ].join('，');

  return (
    <Pressable
      onPress={() => onPress(purchase.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={2}>
            {purchase.name}
          </Text>
          <View style={styles.remainingTag}>
            <Text style={styles.remainingLabel}>剩余 {purchase.remaining} 次</Text>
          </View>
        </View>

        <View style={[styles.statusTag, expired ? styles.statusExpired : styles.statusDue]}>
          <Text style={[styles.statusLabel, expired ? styles.statusLabelExpired : null]}>
            {purchase.statusLabel} · {purchase.expiresOn}
          </Text>
        </View>

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
  remainingTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    backgroundColor: Colors.mintLight,
  },
  remainingLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  statusTag: {
    // 只包住文字本身，字号放大时整块自然长高，不会横向撑破卡片。
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
  },
  statusDue: {
    backgroundColor: Colors.coralLight,
    borderColor: Colors.coral,
  },
  statusExpired: {
    backgroundColor: Colors.backgroundWarm,
    borderColor: Colors.borderLight,
  },
  statusLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  statusLabelExpired: {
    color: Colors.textSecondary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
