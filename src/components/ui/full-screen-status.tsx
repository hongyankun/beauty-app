import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from './button';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';

export type FullScreenStatusVariant = 'loading' | 'error';

export type FullScreenStatusProps = {
  variant: FullScreenStatusVariant;
  /** 一句话说明当前状态，使用用户语言，不出现技术术语 */
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

/**
 * 整屏状态页：App 级别的加载与失败提示。
 *
 * 用于还没有任何页面可渲染的时刻（例如本地数据库初始化），
 * 因此不依赖 `Screen`、导航栏与 Tab 栏。
 *
 * 视觉沿用 Fresh Mint：暖白底、无阴影、文字层级靠字号与颜色区分
 * （docs/UI_REFERENCE.md）。状态同时由文字表达，不只依赖颜色（PRD-NFR-005）。
 */
export function FullScreenStatus({
  variant,
  title,
  description,
  actionLabel,
  onActionPress,
}: FullScreenStatusProps) {
  return (
    <View
      style={styles.root}
      accessibilityRole={variant === 'error' ? 'alert' : 'none'}
      accessibilityLabel={description ? `${title}。${description}` : title}
    >
      {variant === 'loading' ? (
        <ActivityIndicator size="small" color={Colors.mintStrong} />
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {actionLabel && onActionPress ? (
        <Button label={actionLabel} onPress={onActionPress} variant="primary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Layout.pageHorizontal,
    backgroundColor: Colors.backgroundWarm,
  },
  texts: {
    alignItems: 'center',
    gap: Layout.labelGap,
  },
  title: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
