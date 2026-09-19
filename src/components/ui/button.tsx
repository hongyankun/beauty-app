import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
  /**
   * 进行中：按钮内显示指示器并自动禁用，防止重复提交
   * （docs/UI_REFERENCE.md 第 10 章、PRD-RED-005）。
   * 进行中的文案由 `label` 承担，例如「正在保存…」，不只靠指示器表达状态。
   */
  loading?: boolean;
  /**
   * 覆盖读屏标签。
   *
   * 同一屏里出现多个同名按钮时必须给出（例如详情页每个项目都有一个「核销一次」），
   * 否则读屏用户听到的全是同一句话，分不清在操作哪一项。
   */
  accessibilityLabel?: string;
  /**
   * 这个按钮表达的是一个**开关状态**（例如「收藏文章 / 已收藏」）。
   *
   * 给出后会写进 `accessibilityState.selected`，读屏用户听得到「已选中」。
   * 状态本身仍必须由 `label` 说清楚，不能只靠这个属性和颜色（PRD-NFR-005）。
   */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled = false,
  disabledReason,
  loading = false,
  accessibilityLabel,
  selected,
  style,
}: ButtonProps) {
  const contentColor = CONTENT_COLORS[variant];
  const isInteractive = !disabled && !loading;

  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={!isInteractive}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          (disabled && disabledReason ? `${label}，${disabledReason}` : label)
        }
        accessibilityState={{ disabled: !isInteractive, busy: loading, selected }}
        style={({ pressed }) => [
          styles.base,
          VARIANT_STYLES[variant],
          pressed && isInteractive ? styles.pressed : null,
          !isInteractive ? styles.disabled : null,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={contentColor} /> : null}
        {icon && !loading ? <Icon name={icon} size={20} color={contentColor} /> : null}
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
