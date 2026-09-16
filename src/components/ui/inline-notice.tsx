import { StyleSheet, Text, View } from 'react-native';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type InlineNoticeTone = 'neutral' | 'warning';

export type InlineNoticeProps = {
  tone?: InlineNoticeTone;
  /** 一句说明，必须能独立表达状态，不依赖颜色（PRD-NFR-005） */
  message: string;
  /** 右侧或下方的次级动作，例如「重试」 */
  actionLabel?: string;
  onActionPress?: () => void;
};

/**
 * 行内提示条：浅底 + 图标 + 文字，可选一个次级动作。
 *
 * 用于「读取失败可重试」「总价与分摊不一致」这类**不阻断操作**的提示。
 * 浅底取 `mintLight` / `coralLight`，不使用饱和色块（docs/UI_REFERENCE.md 第 3.1、11 章）。
 */
export function InlineNotice({
  tone = 'neutral',
  message,
  actionLabel,
  onActionPress,
}: InlineNoticeProps) {
  const warning = tone === 'warning';
  const icon: IconName = warning ? 'warning' : 'about';

  return (
    <View
      style={[styles.notice, warning ? styles.warning : styles.neutral]}
      accessibilityRole={warning ? 'alert' : 'none'}
      accessibilityLabel={message}
    >
      <View style={styles.row}>
        <Icon name={icon} size={20} color={warning ? Colors.coral : Colors.mintStrong} />
        <Text style={styles.message}>{message}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <Button label={actionLabel} onPress={onActionPress} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: Spacing.md,
    padding: Layout.cardPadding,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
  },
  neutral: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.borderLight,
  },
  warning: {
    backgroundColor: Colors.coralLight,
    borderColor: Colors.coral,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Layout.iconGap,
  },
  message: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
  },
});
