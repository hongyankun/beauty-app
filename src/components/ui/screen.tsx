import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Spacing, TextStyles } from '@/theme';

export type ScreenProps = {
  /** 页面主标题，简体中文 */
  title: string;
  /** 标题下的一句说明，可省略 */
  subtitle?: string;
  children: ReactNode;
};

/**
 * 一级页面的统一外壳：暖白底、页面左右边距 16、顶部安全区、可滚动内容区。
 *
 * 五个 Tab 页面共用同一套标题排版，保证横向切换时标题位置不跳动。
 */
export function Screen({ title, subtitle, children }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header} accessibilityRole="header">
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.backgroundWarm,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.pageHorizontal,
    paddingBottom: Spacing.xxxl,
    gap: Layout.sectionGap,
  },
  header: {
    gap: Layout.tightGap,
  },
  title: {
    ...TextStyles.pageTitle,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
});
