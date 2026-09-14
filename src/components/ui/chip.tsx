import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './icon';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

/**
 * 筛选标签。选中态用 mintLight 浅底 + mintStrong 描边与对勾，
 * 并保持 textPrimary 文字，避免只靠颜色表达状态（PRD-NFR-005）。
 */
export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={Layout.labelGap}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipDefault,
        pressed ? styles.pressed : null,
      ]}
    >
      {selected ? <Icon name="check" size={14} color={Colors.mintStrong} /> : null}
      <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export type ChipRowProps = {
  children: ReactNode;
  /** 供读屏理解这一组筛选项的用途 */
  accessibilityLabel: string;
};

/** 一行可换行的标签组，标签之间保持 8pt 间距。 */
export function ChipRow({ children, accessibilityLabel }: ChipRowProps) {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.tightGap,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
  },
  chipDefault: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderLight,
  },
  chipSelected: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintStrong,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textSecondary,
  },
  labelSelected: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
