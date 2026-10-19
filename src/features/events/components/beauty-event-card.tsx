import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { eventCardAccessibilityLabel, type BeautyEventCard as BeautyEventCardData } from '../event-summary';

export type BeautyEventCardProps = {
  readonly card: BeautyEventCardData;
  /** 点击整张卡片进入这条变美记录的详情 */
  readonly onPress: (eventId: string) => void;
};

/** 机构留空时的统一说法：陈述事实，不编造机构名。 */
const NO_INSTITUTION = '未填写机构';

/**
 * 一张变美记录卡片（BT-0024 裁决 5）：变美历史与首页「最近变美」共用。
 *
 * 一条变美记录对应一张卡片，展示日期、机构快照、地点快照、项目摘要与撤销摘要；
 * 使用人、来源与每条备注只在详情里展示。整张卡片是一个读屏节点、一个按钮，卡片内没有别的可点控件。
 * 撤销状态用文字说明，不只靠颜色（PRD-NFR-005）。文字自由换行，最大字号下不截断。
 */
export function BeautyEventCard({ card, onPress }: BeautyEventCardProps) {
  const place =
    card.locationLabel === null
      ? (card.institutionName ?? NO_INSTITUTION)
      : `${card.institutionName ?? NO_INSTITUTION} · ${card.locationLabel}`;

  return (
    <Pressable
      onPress={() => onPress(card.id)}
      accessibilityRole="button"
      accessibilityLabel={eventCardAccessibilityLabel(card)}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.date}>{card.occurredOn}</Text>
          {card.voidSummary === null ? null : (
            <View style={styles.tag}>
              <Text style={styles.tagLabel}>{card.voidSummary}</Text>
            </View>
          )}
        </View>
        <Text style={styles.services}>{card.serviceSummary}</Text>
        <Text style={styles.meta}>{place}</Text>
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  date: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.backgroundWarm,
  },
  tagLabel: {
    ...TextStyles.caption,
    color: Colors.textPrimary,
  },
  services: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
