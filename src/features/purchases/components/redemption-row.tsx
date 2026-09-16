import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatTimestampAsLocalMinute } from '@/utils/timestamp';
import type { PurchaseDetailRedemption } from '../services/get-purchase-detail';

export type RedemptionRowProps = {
  redemption: PurchaseDetailRedemption;
  /** 发起撤销。只对仍然有效的记录传入 */
  onVoid: (redemption: PurchaseDetailRedemption) => void;
};

/**
 * 核销历史里的一条记录。
 *
 * 已撤销的记录保留在历史里，做灰度处理并明确标注「已撤销」，
 * 不使用 `void`、`active` 这类技术术语（UI_REFERENCE 第 11 章、PRD-RED-010）。
 * 状态同时有文字，不靠颜色单独区分（PRD-NFR-005）。
 *
 * 机构与城市取的是**核销当时的快照**，机构日后改名也不会改写这里（PRD-INST-005）。
 *
 * 只有有效记录才有「撤销核销」。已撤销的记录不再提供任何操作：
 * 第一版不支持恢复，也不提供删除单条核销的入口（PRD-RED-011、ADR-016）。
 */
export function RedemptionRow({ redemption, onVoid }: RedemptionRowProps) {
  const isVoid = redemption.status === 'void';
  const voidedAt =
    redemption.voidedAt === null ? null : formatTimestampAsLocalMinute(redemption.voidedAt);

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

      {isVoid ? (
        <View style={styles.voidInfo}>
          {/* 撤销时间是系统时间戳，按本地时区展示；解析不出来时整行不显示，
              不把 Invalid Date 摆到用户面前。 */}
          {voidedAt ? <Text style={styles.meta}>撤销于 {voidedAt}</Text> : null}
          {/* 原因是选填的，没填就不占一行，也不补一句编造的默认原因。 */}
          {redemption.voidReason ? (
            <Text style={styles.meta}>撤销原因：{redemption.voidReason}</Text>
          ) : null}
        </View>
      ) : (
        <Button
          label="撤销核销"
          variant="danger"
          onPress={() => onVoid(redemption)}
          style={styles.voidAction}
          // 同一屏里每条记录都有一个同名按钮，读屏必须能听出在操作哪一条。
          accessibilityLabel={`撤销核销 ${redemption.itemName}，核销日期 ${redemption.redeemedOn}`}
        />
      )}
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
  voidInfo: {
    gap: Layout.tightGap,
  },
  voidAction: {
    // 与上方文字拉开到卡片内常规的 12，不让操作贴着说明文字。
    marginTop: Layout.iconGap,
  },
});
