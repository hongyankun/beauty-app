import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  Screen,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { Layout } from '@/theme';

/**
 * 首页总览（静态骨架）。
 *
 * 视觉重点是「少而大」：两个关键数字 + 两个快捷入口 + 最近记录
 * （docs/UI_REFERENCE.md 第 13 章）。本任务不接数据，数值一律显示占位符，
 * 不虚构任何消费数据，也不做图表。
 */
export default function HomeScreen() {
  const comingSoon = useComingSoon();

  return (
    <Screen title="你好" subtitle="把每一次护理，都认真记录下来">
      <View style={styles.statRow}>
        <StatCard label="待使用次数" value="—" unit="次" hint="录入套餐后自动计算" />
        <StatCard label="累计投入" value="—" hint="按购买金额统计" />
      </View>

      <View style={styles.actions}>
        <Button
          label="添加套餐"
          icon="plus"
          variant="primary"
          onPress={() => comingSoon('添加套餐')}
        />
        <Button label="记录一次" icon="check" onPress={() => comingSoon('记录一次')} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="最近记录" />
        <EmptyState
          icon="inbox"
          title="还没有记录"
          description="完成第一次记录后，这里会显示最近做过的项目。"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    gap: Layout.cardGap,
  },
  actions: {
    gap: Layout.cardGap,
  },
  section: {
    gap: Layout.cardGap,
  },
});
