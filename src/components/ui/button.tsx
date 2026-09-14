import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** 每屏最多一个 primary，见 docs/UI_REFERENCE.md 第 10 章 */
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** 禁用时必须说明原因，不能只靠降低不透明度 */
  disabledReason?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled = false,
  disabledReason,
  style,
}: ButtonProps) {
  const contentColor = CONTENT_COLORS[variant];

  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.base,
          VARIANT_STYLES[variant],
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={contentColor} /> : null}
        <Text style={[styles.label, { color: contentColor }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {disabled && disabledReason ? (
        <Text style={styles.disabledReason}>{disabledReason}</Text>
      ) : null}
    </View>
  );
}

const CONTENT_COLORS: Record<ButtonVariant, string> = {
  primary: Colors.surface,
  secondary: Colors.textPrimary,
  text: Colors.mintStrong,
  danger: Colors.coral,
};

const VARIANT_STYLES = StyleSheet.create({
  primary: {
    backgroundColor: Colors.mintStrong,
    borderRadius: Radii.card,
  },
  secondary: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
  },
  text: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  danger: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.coral,
  },
});

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Layout.iconGap,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...TextStyles.label,
  },
  disabledReason: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    marginTop: Layout.tightGap,
    textAlign: 'center',
  },
});
