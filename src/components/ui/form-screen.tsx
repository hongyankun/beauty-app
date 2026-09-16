import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderWidth, Colors, Layout, Spacing, TextStyles } from '@/theme';

export type FormScreenProps = {
  title: string;
  subtitle?: string;
  /** 左上角的返回动作文案，默认「取消」 */
  cancelLabel?: string;
  onCancel: () => void;
  /** 固定在底部安全区上方的提交区（docs/UI_REFERENCE.md 第 9 章） */
  footer: ReactNode;
  children: ReactNode;
};

/**
 * 全屏表单外壳。
 *
 * 与一级页面的 `Screen` 分开是因为表单有三条额外要求：
 * 1. 覆盖 Tab 栏并自带一个明确的返回出口（IA 第 4.3 节第 1 条）；
 * 2. 提交区固定在底部安全区上方，不随内容滚走；
 * 3. 键盘弹出时提交区与最后一个输入框都不被遮挡。
 *
 * 第 3 点由 `KeyboardAvoidingView` 承担：它压缩滚动区并把页脚顶到键盘上方，
 * 滚动区再用 `keyboardShouldPersistTaps` 保证键盘打开时也能直接点到下面的控件。
 */
export function FormScreen({
  title,
  subtitle,
  cancelLabel = '取消',
  onCancel,
  footer,
  children,
}: FormScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          hitSlop={Layout.labelGap}
          style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
        >
          <Text style={styles.cancelLabel}>{cancelLabel}</Text>
        </Pressable>
        <View style={styles.titles} accessibilityRole="header">
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.backgroundWarm,
  },
  header: {
    gap: Spacing.md,
    paddingHorizontal: Layout.pageHorizontal,
    paddingBottom: Spacing.lg,
  },
  cancel: {
    minHeight: Layout.minTouchSize,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
  cancelLabel: {
    ...TextStyles.label,
    color: Colors.mintStrong,
  },
  titles: {
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.pageHorizontal,
    paddingBottom: Spacing.xxxl,
    gap: Layout.sectionGap,
  },
  footer: {
    gap: Spacing.md,
    paddingHorizontal: Layout.pageHorizontal,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.backgroundWarm,
    borderTopWidth: BorderWidth.hairline,
    borderTopColor: Colors.borderLight,
  },
});
