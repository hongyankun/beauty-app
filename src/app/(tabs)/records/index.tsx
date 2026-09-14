import { StyleSheet, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, Screen } from '@/components/ui';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { Layout } from '@/theme';

/**
 * 记录列表（静态骨架）。
 *
 * 筛选标签目前是静态外观，选中态固定为「全部」，切换逻辑随记录功能一起实现。
 */
export default function RecordsScreen() {
  const comingSoon = useComingSoon();

  return (
    <Screen title="记录" subtitle="管理买过的套餐与每一次核销。">
      <View style={styles.section}>
        <ChipRow accessibilityLabel="套餐筛选">
          <Chip label="全部" selected onPress={() => comingSoon('筛选套餐')} />
          <Chip label="待使用" onPress={() => comingSoon('筛选套餐')} />
          <Chip label="已完成" onPress={() => comingSoon('筛选套餐')} />
        </ChipRow>

        <EmptyState
          icon="records"
          title="还没有套餐"
          description="录入购买过的套餐后，可以在这里查看剩余次数与有效期。"
        />
      </View>

      <Button
        label="添加套餐"
        icon="plus"
        variant="primary"
        onPress={() => comingSoon('添加套餐')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Layout.cardGap,
  },
});
