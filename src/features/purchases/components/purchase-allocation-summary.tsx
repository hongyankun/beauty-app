import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import type { DraftAllocation } from '../purchase-draft';
import { allocationStatusText } from '../services/purchase-allocation';

export type PurchaseAllocationSummaryProps = {
  allocation: DraftAllocation;
};

/**
 * 第二步的金额摘要：套餐总价、已分配、剩余待分配或已超出（PRD 第 5B.6 节）。
 *
 * 状态同时用文字与颜色表达（PRD-NFR-005）：超额用警示浅底，平衡用主色浅底，
 * 未分配完保持中性。文字一律用高对比度的前景色，浅底只作辅助。
 *
 * 这里只陈述数字，不提供「自动补平」「按次数分摊」之类的按钮：
 * 金额怎么分只能由用户决定，App 不替用户改任何一笔。
 */
export function PurchaseAllocationSummary({ allocation }: PurchaseAllocationSummaryProps) {
  const { summary, incompleteCount } = allocation;

  if (summary === null) {
    return (
      <Card>
        <Text style={styles.hint}>填写套餐总价后，这里会显示分配情况。</Text>
      </Card>
    );
  }

  const statusText = allocationStatusText(summary);
  const incompleteText =
    incompleteCount > 0 ? `还有 ${incompleteCount} 个项目没有填写分配金额，暂按 0 计算。` : null;
  const accessibilityLabel = [
    `套餐总价 ${formatMinorAsYuan(summary.totalMinor)}`,
    `已分配 ${formatMinorAsYuan(summary.allocatedMinor)}`,
    statusText,
    incompleteText,
  ]
    .filter((part) => part !== null)
    .join('，');

  return (
    <Card>
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.label}>套餐总价</Text>
          <Text style={styles.value}>{formatMinorAsYuan(summary.totalMinor)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>已分配</Text>
          <Text style={styles.value}>{formatMinorAsYuan(summary.allocatedMinor)}</Text>
        </View>
        <View style={[styles.status, statusStyles[summary.status]]}>
          <Text style={[styles.statusText, statusTextStyles[summary.status]]}>{statusText}</Text>
        </View>
        {incompleteText === null ? null : <Text style={styles.hint}>{incompleteText}</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Layout.labelGap,
  },
  // 大字号下标签与金额放不下一行时整体换行，不截断（PRD-NFR-006）。
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: Layout.iconGap,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textSecondary,
  },
  value: {
    ...TextStyles.numeric,
    color: Colors.textPrimary,
  },
  status: {
    marginTop: Layout.tightGap,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
  },
  statusText: {
    ...TextStyles.bodyStrong,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});

const statusStyles = StyleSheet.create({
  balanced: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintLight,
  },
  underAllocated: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderLight,
  },
  overAllocated: {
    backgroundColor: Colors.coralLight,
    borderColor: Colors.coral,
  },
});

const statusTextStyles = StyleSheet.create({
  balanced: {
    color: Colors.mintStrong,
  },
  underAllocated: {
    color: Colors.textPrimary,
  },
  overAllocated: {
    color: Colors.textPrimary,
  },
});
