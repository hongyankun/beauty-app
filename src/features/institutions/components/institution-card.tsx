import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { InstitutionSummary } from '../services/institution-view';

export type InstitutionCardProps = {
  institution: InstitutionSummary;
  /** 点击整张卡片，进入这个机构的编辑页 */
  onPress: (institutionId: string) => void;
};

/**
 * 机构列表里的一张卡片。
 *
 * 状态同时有文字标签，不靠颜色单独区分（PRD-NFR-005）；已归档用中性浅底 +
 * 细描边，不用大面积警示色——归档不是错误，也不是删除。
 *
 * 每一项独占一行、可自由换行，因此系统字体放到最大档时名称、城市、备注与
 * 关联条数都是换行而不是被截断（PRD-NFR-006、任务书第十六节）。
 *
 * 整张卡片是一个读屏节点，一次读出名称、城市、状态、关联条数与「编辑机构」，
 * 而不是让用户逐行听散落的碎片。
 */
export function InstitutionCard({ institution, onPress }: InstitutionCardProps) {
  const label = [
    institution.name,
    institution.city,
    institution.statusLabel,
    `关联 ${institution.purchaseCount} 个套餐`,
    `${institution.redemptionCount} 条核销记录`,
    institution.notesSummary === null ? null : `备注 ${institution.notesSummary}`,
    '编辑机构',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(institution.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name}>{institution.name}</Text>
          <View style={[styles.tag, institution.isArchived ? styles.tagArchived : styles.tagActive]}>
            <Text style={styles.tagLabel}>{institution.statusLabel}</Text>
          </View>
        </View>

        {/* 城市与备注没填时整段省略，不补「未填写」这类占位。 */}
        {institution.city === null ? null : <Text style={styles.meta}>{institution.city}</Text>}
        {institution.notesSummary === null ? null : (
          <Text style={styles.meta}>{institution.notesSummary}</Text>
        )}

        {/* 条数只说明影响范围，不改写任何历史快照（任务书第四节）。 */}
        <Text style={styles.meta}>{institution.usageLabel}</Text>
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
  tagArchived: {
    backgroundColor: Colors.backgroundWarm,
    borderColor: Colors.borderLight,
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
