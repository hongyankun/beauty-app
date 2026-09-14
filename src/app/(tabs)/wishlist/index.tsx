import { StyleSheet, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, Screen } from '@/components/ui';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { Layout } from '@/theme';

/** 心愿状态，见 docs/PRODUCT_REQUIREMENTS.md 第 11.2 节。 */
const WISH_STATUSES = ['想了解', '考虑中', '计划进行', '已完成', '已放弃'] as const;

/**
 * 心愿单列表（静态骨架）。
 *
 * 视觉上更松：卡片间距更大，状态标签是主要区分手段，不使用促销式强调。
 */
export default function WishlistScreen() {
  const comingSoon = useComingSoon();

  return (
    <Screen title="心愿单" subtitle="记录想了解和打算做的项目。">
      <View style={styles.section}>
        <ChipRow accessibilityLabel="心愿状态筛选">
          {WISH_STATUSES.map((status, index) => (
            <Chip
              key={status}
              label={status}
              selected={index === 0}
              onPress={() => comingSoon('筛选心愿')}
            />
          ))}
        </ChipRow>

        <EmptyState
          icon="wishlist"
          title="还没有心愿"
          description="把想了解的项目加进来，可以记录预算和计划时间。"
        />
      </View>

      <Button
        label="添加心愿"
        icon="plus"
        variant="primary"
        onPress={() => comingSoon('添加心愿')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.sectionGap,
  },
});
