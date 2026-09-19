import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { FavoriteArticleSummary } from '../favorites-view';

export type FavoriteArticleCardProps = {
  article: FavoriteArticleSummary;
  onPress: () => void;
};

/**
 * 收藏列表中的一篇文章。
 *
 * 与百科首页的 `ArticleCard` 是两张卡而不是一张：这里没有标签，
 * 底部动作写的是「查看文章」而不是「查看详情」——用户是从心愿单 Tab
 * 过去的，需要知道点下去会离开当前列表去读原文（任务书第 9.2 节）。
 *
 * 整张卡片可点击，并且是**一个**读屏节点：标题、分类、摘要与「查看文章」
 * 一次读完，读屏用户不需要在卡片内部逐个滑过（任务书第十二节）。
 */
export function FavoriteArticleCard({ article, onPress }: FavoriteArticleCardProps) {
  const accessibilityLabel = [
    article.title,
    `分类：${article.categoryLabel}`,
    article.summary,
    '查看文章',
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
          {article.categoryLabel}
        </Text>
      </View>
      <Text style={styles.title} importantForAccessibility="no">
        {article.title}
      </Text>
      <Text style={styles.summary} importantForAccessibility="no">
        {article.summary}
      </Text>
      <View style={styles.footer} importantForAccessibility="no-hide-descendants">
        <Text style={styles.action}>查看文章</Text>
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
