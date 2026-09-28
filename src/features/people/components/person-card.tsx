import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { PersonSummary } from '../services/person-view';

export type PersonCardProps = {
  person: PersonSummary;
  /** 点击整张卡片，进入这个人的编辑页 */
  onPress: (personId: string) => void;
};

/**
 * 使用人列表里的一张卡片。
 *
 * 与机构卡片同一套样式：状态带文字标签，不靠颜色单独区分（PRD-NFR-005）；
 * 「自己」另带一个「固定」标签，说明它不能改名、归档或删除。
 * 整张卡片是一个读屏节点。
 */
export function PersonCard({ person, onPress }: PersonCardProps) {
  const label = [
    person.name,
    person.isSelf ? '固定使用人' : null,
    person.statusLabel,
    person.usageLabel,
    person.isSelf ? '查看' : '编辑',
  ]
    .filter((part): part is string => part !== null)
    .join('，');

  return (
    <Pressable
      onPress={() => onPress(person.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name}>{person.name}</Text>
          <View style={styles.tags}>
            {person.isSelf ? (
              <View style={[styles.tag, styles.tagArchived]}>
                <Text style={styles.tagLabel}>固定</Text>
              </View>
            ) : null}
            <View style={[styles.tag, person.isArchived ? styles.tagArchived : styles.tagActive]}>
              <Text style={styles.tagLabel}>{person.statusLabel}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.meta}>{person.usageLabel}</Text>
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
    flex: 1,
  },
  tags: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: Spacing.xs,
  },
  tag: {
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
