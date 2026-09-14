import { StyleSheet, Text, View } from 'react-native';

import { Button } from './button';
import { Card } from './card';
import { Icon, type IconName } from './icon';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';

export type EmptyStateProps = {
  icon: IconName;
  /** 一句引导，不写成「暂无数据」 */
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

/**
 * 空状态：一句引导 + 一个动作，见 docs/UI_REFERENCE.md 第 11 章。
 * 图标尺寸 32，仅作装饰，语义由标题与说明承担。
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  return (
    <Card style={styles.card}>
      <Icon name={icon} size={32} color={Colors.mintPrimary} />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <Button label={actionLabel} onPress={onActionPress} variant="secondary" />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  texts: {
    alignItems: 'center',
    gap: Layout.tightGap,
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
