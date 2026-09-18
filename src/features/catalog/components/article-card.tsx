import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_NAMES, type EncyclopediaArticle } from '../types';
import { Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

/** 卡片上最多显示的标签数（任务书第九节）。 */
const MAX_TAGS = 3;

export type ArticleCardProps = {
  article: EncyclopediaArticle;
  onPress: () => void;
};

/**
 * 列表中的一篇文章。
 *
 * 整张卡片可点击，并且是**一个**读屏节点：标题、分类、摘要与「查看详情」
 * 一次读完，读屏用户不需要在卡片内部逐个滑过（任务书第十五节）。
 * 标签是对摘要的补充，已经包含在朗读内容里，因此对读屏隐藏。
 */
export function ArticleCard({ article, onPress }: ArticleCardProps) {
  const tags = article.tags.slice(0, MAX_TAGS);
  const accessibilityLabel = [
    article.title,
    `分类：${CATEGORY_NAMES[article.category]}`,
    article.summary,
    '查看详情',
  ].join('。');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessible
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.categoryRow}>
        <Text style={styles.category} importantForAccessibility="no">
          {CATEGORY_NAMES[article.category]}
        </Text>
      </View>
      <Text style={styles.title} importantForAccessibility="no">
        {article.title}
      </Text>
      <Text style={styles.summary} importantForAccessibility="no">
        {article.summary}
      </Text>
      {tags.length > 0 ? (
        <View style={styles.tagRow} importantForAccessibility="no-hide-descendants">
          {tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.footer} importantForAccessibility="no-hide-descendants">
        <Text style={styles.action}>查看详情</Text>
        <Icon name="chevronRight" size={16} color={Colors.mintStrong} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Layout.labelGap,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    padding: Layout.cardPadding,
  },
  pressed: {
    opacity: 0.7,
  },
  categoryRow: {
    flexDirection: 'row',
  },
  category: {
    ...TextStyles.caption,
    color: Colors.mintStrong,
    backgroundColor: Colors.mintLight,
    borderRadius: Radii.tag,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Layout.tightGap,
    overflow: 'hidden',
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  summary: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    borderRadius: Radii.tag,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Layout.tightGap,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.tightGap,
    paddingTop: Layout.tightGap,
  },
  action: {
    ...TextStyles.label,
    color: Colors.mintStrong,
    fontWeight: '600',
  },
});
