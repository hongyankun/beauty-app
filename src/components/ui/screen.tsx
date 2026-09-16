import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { Icon } from './icon';

export type ScreenProps = {
  /** 页面主标题，简体中文 */
  title: string;
  /** 标题下的一句说明，可省略 */
  subtitle?: string;
  /**
   * 返回上一页。
   *
   * 一级 Tab 页面不传这个属性；压在 Tab 栈里的详情页必须传，
   * 否则只能靠系统侧滑手势返回，读屏用户没有可达的出口（IA 第 1 节：不存在死链）。
   */
  onBack?: () => void;
  /** 返回按钮的文案与读屏标签，默认「返回」 */
  backLabel?: string;
  /**
   * 内容区是否由 Screen 自己滚动，默认是。
   *
   * 置为 false 时 Screen 只负责标题与边距，内容区交给调用方填满剩余高度。
   * 长列表页需要这样做：列表必须是 `FlatList` 才能在数百个套餐下保持流畅
   * （PRD-NFR-007），而把 `FlatList` 套进 `ScrollView` 会让它退化成一次性全量渲染。
   */
  scrollable?: boolean;
  children: ReactNode;
};

/**
 * 一级页面的统一外壳：暖白底、页面左右边距 16、顶部安全区、可滚动内容区。
 *
 * 五个 Tab 页面共用同一套标题排版，保证横向切换时标题位置不跳动。
 */
export function Screen({
  title,
  subtitle,
  onBack,
  backLabel = '返回',
  scrollable = true,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.headerGroup}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={Layout.labelGap}
          style={({ pressed }) => [styles.back, pressed ? styles.pressed : null]}
        >
          <Icon name="chevronLeft" size={20} color={Colors.mintStrong} />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : null}
      <View style={styles.header} accessibilityRole="header">
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  if (!scrollable) {
    return (
      <View style={styles.root}>
        <View style={[styles.content, styles.staticContent, { paddingTop: insets.top + Spacing.lg }]}>
          {header}
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {header}
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
  staticContent: {
    // 不滚动时由内容区填满剩余高度；底部留白交给内部的列表与固定操作区，
    // 否则固定在底部的主按钮会被这里的 paddingBottom 顶起来。
    flex: 1,
    paddingBottom: 0,
  },
  headerGroup: {
    gap: Layout.labelGap,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.tightGap,
    minHeight: Layout.minTouchSize,
    alignSelf: 'flex-start',
    // 图标本身只有 20pt 宽，左侧补一点负边距让文字与页面标题左对齐。
    marginLeft: -Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  backLabel: {
    ...TextStyles.label,
    color: Colors.mintStrong,
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
