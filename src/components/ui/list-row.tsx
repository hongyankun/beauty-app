import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** 行尾的说明文字，例如版本号 */
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  /** 是否显示右侧箭头，表示可进入下一级 */
  showChevron?: boolean;
};

/** 分组列表中的一行：可选图标 + 标题 + 可选副标题 + 可选右侧文字 + 可选箭头。 */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  showChevron = true,
}: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={subtitle ? `${title}，${subtitle}` : title}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      {icon ? <Icon name={icon} size={20} color={Colors.textSecondary} /> : null}
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress && showChevron ? (
        <Icon name="chevronRight" size={20} color={Colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

export type ListGroupProps = {
  children: ReactNode;
  /** 行内有前置图标时，分隔线左端与文字对齐而不是通栏 */
  hasLeadingIcons?: boolean;
};

/** 分组列表容器：白底、圆角 16、1pt 描边，行与行之间 1pt 分隔线。 */
export function ListGroup({ children, hasLeadingIcons = false }: ListGroupProps) {
  const rows = Children.toArray(children);
  const separatorInset = hasLeadingIcons
    ? Layout.cardPadding + 20 + Layout.iconGap
    : Layout.cardPadding;

  return (
    <View style={styles.group}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={[styles.separator, { marginLeft: separatorInset }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  separator: {
    height: BorderWidth.hairline,
    backgroundColor: Colors.borderLight,
  },
  row: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    paddingHorizontal: Layout.cardPadding,
    paddingVertical: Spacing.md,
  },
  pressed: {
    backgroundColor: Colors.mintLight,
  },
  texts: {
    flex: 1,
    gap: Layout.tightGap,
  },
  title: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  value: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
