import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { PurchaseDetailRedemption } from '../services/get-purchase-detail';

export type RedemptionRowProps = {
  redemption: PurchaseDetailRedemption;
};

/**
 * 核销历史里的一条记录。
 *
 * 已撤销的记录保留在历史里，做灰度处理并明确标注「已撤销」，
 * 不使用 `void`、`active` 这类技术术语（UI_REFERENCE 第 11 章、PRD-RED-010）。
 * 状态同时有文字，不靠颜色单独区分（PRD-NFR-005）。
 *
 * 机构与城市取的是**核销当时的快照**，机构日后改名也不会改写这里（PRD-INST-005）。
 */
export function RedemptionRow({ redemption }: RedemptionRowProps) {
  const isVoid = redemption.status === 'void';

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.date, isVoid ? styles.muted : null]}>{redemption.redeemedOn}</Text>
        <View style={[styles.tag, isVoid ? styles.tagVoid : styles.tagActive]}>
          <Text style={[styles.tagLabel, isVoid ? styles.muted : null]}>
            {isVoid ? '已撤销' : '有效'}
          </Text>
        </View>
      </View>

      <Text style={[styles.name, isVoid ? styles.muted : null]} numberOfLines={2}>
        {redemption.itemName}
      </Text>

      <Text style={styles.meta}>
        {redemption.institutionName ?? '未填写机构'}
        {redemption.city === null ? '' : ` · ${redemption.city}`}
      </Text>

      {redemption.notes ? <Text style={styles.meta}>{redemption.notes}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Layout.tightGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  date: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  name: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  muted: {
    color: Colors.textSecondary,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
  },
  tagActive: {
    backgroundColor: Colors.mintLight,
  },
  tagVoid: {
    backgroundColor: Colors.backgroundWarm,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
