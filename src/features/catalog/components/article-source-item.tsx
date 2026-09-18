import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SOURCE_KIND_NAMES, type ArticleSource } from '../types';
import { Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Spacing, TextStyles } from '@/theme';

export type ArticleSourceItemProps = {
  source: ArticleSource;
  onPress: (source: ArticleSource) => void;
  /** 最后一条不画下分隔线，避免卡片底部多出一条横线 */
  isLast?: boolean;
};

/**
 * 一条资料来源。
 *
 * 点击后用系统浏览器打开，因此明确声明「在浏览器中打开」，
 * 不让用户以为会留在 App 内（任务书第十五节）。
 * 标题可能很长，允许换行，不截断。
 */
export function ArticleSourceItem({ source, onPress, isLast = false }: ArticleSourceItemProps) {
  return (
    <Pressable
      onPress={() => onPress(source)}
      accessibilityRole="link"
      accessible
      accessibilityLabel={`${source.publisher}：${source.title}。${SOURCE_KIND_NAMES[source.kind]}。在浏览器中打开`}
      style={({ pressed }) => [
        styles.item,
        isLast ? null : styles.divided,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.texts} importantForAccessibility="no-hide-descendants">
        <Text style={styles.publisher}>
          {source.publisher}
          <Text style={styles.kind}>{` · ${SOURCE_KIND_NAMES[source.kind]}`}</Text>
        </Text>
        <Text style={styles.title}>{source.title}</Text>
        <Text style={styles.hint}>在浏览器中打开</Text>
      </View>
      <Icon name="chevronRight" size={16} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    minHeight: Layout.minTouchSize,
    paddingVertical: Spacing.md,
  },
  divided: {
    borderBottomWidth: BorderWidth.hairline,
    borderBottomColor: Colors.borderLight,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flex: 1,
    gap: Layout.tightGap,
  },
  publisher: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  kind: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  title: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.mintStrong,
  },
});
