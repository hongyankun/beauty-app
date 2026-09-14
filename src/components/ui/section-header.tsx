import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Layout, TextStyles } from '@/theme';

export type SectionHeaderProps = {
  title: string;
  /** 右侧文字按钮，例如「查看全部」 */
  actionLabel?: string;
  onActionPress?: () => void;
};

/** 区块标题行：左标题 + 可选的右侧文字按钮。 */
export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={Layout.labelGap}
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  action: {
    minHeight: Layout.minTouchSize,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  actionLabel: {
    ...TextStyles.label,
    color: Colors.mintStrong,
  },
});
