import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatTimestampAsLocalMinute } from '@/utils/timestamp';
import type { RedemptionHistoryEntry } from '../services/list-redemption-history';

export type RedemptionHistoryRowProps = {
  entry: RedemptionHistoryEntry;
  /** 点击整条记录，进入它所属的套餐详情 */
  onPress: (purchaseId: string) => void;
};

/**
 * 核销历史中心里的一条记录。
 *
 * 与套餐详情里的 `RedemptionRow` 的分工：那一条**带撤销按钮**，因为它就在
 * 那个套餐的上下文里；这一条**只读**，撤销仍然只能在套餐详情里做
 * （任务书第八节，沿用 BT-0007 / BT-0008 已验证的撤销机制）。
 *
 * 已撤销的记录保留在列表中并置灰、标注「已撤销」，不隐藏、也不当成删除
 * （UI_REFERENCE 第 11 章、ADR-016）。状态同时有文字，不靠颜色单独区分
 * （PRD-NFR-005）；标签用中性浅底与描边，不用大面积警示色。
 *
 * 项目名称独占一行、可自由换行，日期与状态分别在别的行上，
 * 因此系统字体放到最大档也不会互相挤压截断（PRD-NFR-006）。
 */
export function RedemptionHistoryRow({ entry, onPress }: RedemptionHistoryRowProps) {
  const voidedAt = entry.voidedAt === null ? null : formatTimestampAsLocalMinute(entry.voidedAt);
  // 城市为空时整段省略，不留「· 」这种空壳（任务书第七节）。
  const place = entry.city === null ? entry.institutionLabel : `${entry.institutionLabel} · ${entry.city}`;

  // 读屏把卡片里散开的几行合成一句话，整条记录是一个完整节点（任务书第十三节）。
  const label = [
    entry.itemName,
    `属于套餐 ${entry.purchaseName}`,
    `核销日期 ${entry.redeemedOn}`,
    entry.statusLabel,
    place,
    entry.voidReason === null ? null : `撤销原因 ${entry.voidReason}`,
    '查看套餐详情',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(entry.purchaseId)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.name, entry.isVoided ? styles.muted : null]}>{entry.itemName}</Text>
          <View style={[styles.tag, entry.isVoided ? styles.tagVoid : styles.tagActive]}>
            <Text style={styles.tagLabel}>{entry.statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.meta}>{entry.purchaseName}</Text>
        <Text style={styles.date}>{entry.redeemedOn}</Text>
        <Text style={styles.meta}>{place}</Text>

        {entry.notes === null ? null : <Text style={styles.meta}>{entry.notes}</Text>}

        {/* 撤销时间解析不出来时整行不显示，界面上不出现 Invalid Date。 */}
        {voidedAt === null ? null : <Text style={styles.meta}>撤销于 {voidedAt}</Text>}
        {/* 原因是选填的，没填就不占一行，也不补一句编造的默认原因。 */}
        {entry.voidReason === null ? null : (
          <Text style={styles.meta}>撤销原因：{entry.voidReason}</Text>
        )}
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
    // 占满除状态标签以外的宽度并自由换行；标签那侧不收缩，两者不会互相挤。
    flex: 1,
  },
  muted: {
    color: Colors.textSecondary,
  },
  tag: {
    flexShrink: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
  },
  tagActive: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintLight,
  },
  tagVoid: {
    // 已撤销用中性浅底 + 细描边：在白卡片上能看清，又不像警示（任务书第十三节）。
    backgroundColor: Colors.backgroundWarm,
    borderColor: Colors.borderLight,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  date: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
