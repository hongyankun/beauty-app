import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BorderWidth, Colors, Layout, Radii } from '@/theme';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * 基础卡片：白底、圆角 16、1pt borderLight 描边、内边距 16。
 *
 * 常规卡片不加阴影，靠暖白底与白卡片的色差分层（docs/UI_REFERENCE.md 第 6.2、8.1 章）。
 * 一张卡片只承载一个对象。
 */
export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    padding: Layout.cardPadding,
  },
});
