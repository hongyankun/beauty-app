import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing } from '@/theme';

/** 骨架屏展示的占位卡片数量。 */
const PLACEHOLDER_COUNT = 3;

export type PurchaseCardSkeletonProps = {
  /** 读屏朗读的整体说明，默认「正在载入套餐列表」 */
  accessibilityLabel?: string;
};

/**
 * 列表首次加载的骨架屏（UI_REFERENCE 第 8.2 章）。
 *
 * 用与真实卡片一致的外框与行高占位，让内容出现时布局不跳动。
 * 不做闪烁动画：第 8.2 章要求长列表不做逐项动画，而且骨架只会出现很短一瞬。
 *
 * 对读屏整体朗读为「正在载入」，不逐个朗读这些没有意义的灰条。
 */
export function PurchaseCardSkeleton({
  accessibilityLabel = '正在载入套餐列表',
}: PurchaseCardSkeletonProps = {}) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={styles.group}>
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <Card key={index} style={styles.card}>
          <View style={[styles.bar, styles.title]} />
          <View style={[styles.bar, styles.amount]} />
          <View style={[styles.bar, styles.meta]} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Layout.cardGap,
  },
  card: {
    gap: Spacing.md,
  },
  bar: {
    backgroundColor: Colors.borderLight,
    borderRadius: Radii.tag,
  },
  title: {
    height: Spacing.xl,
    width: '60%',
  },
  amount: {
    height: Spacing.lg,
    width: '35%',
  },
  meta: {
    height: Spacing.md,
    width: '80%',
  },
});
