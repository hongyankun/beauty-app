import { StyleSheet, Text, View } from 'react-native';

import { Card } from './card';
import { Colors, Layout, TextStyles } from '@/theme';

export type StatCardProps = {
  /** 数值含义，例如「待使用次数」 */
  label: string;
  /** 已格式化的数值文本；无数据时传 `—` */
  value: string;
  /** 数值后缀，例如「次」 */
  unit?: string;
  /** 数值下方的一句补充说明 */
  hint?: string;
};

/**
 * 关键数字卡片。数值使用衬线字体并右对齐到同一基线，
 * 便于首页两张卡横向扫读（docs/UI_REFERENCE.md 第 4、13 章）。
 */
export function StatCard({ label, value, unit, hint }: StatCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value} allowFontScaling numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: Layout.tightGap,
  },
  label: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Layout.tightGap,
  },
  value: {
    ...TextStyles.statValue,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  unit: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
