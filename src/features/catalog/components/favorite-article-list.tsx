import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { EmptyState, InlineNotice } from '@/components/ui';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import type { FavoriteArticleSummary } from '../favorites-view';
import { useFavoriteArticles } from '../hooks/use-favorite-articles';
import { FavoriteArticleCard } from './favorite-article-card';

export type FavoriteArticleListProps = {
  /** 打开某篇文章的原文。由调用方决定跳哪条路由、返回时落回哪里 */
  onOpenArticle: (slug: string) => void;
  /** 空状态里的「去百科看看」 */
  onBrowseCatalog: () => void;
};

/**
 * 收藏文章列表。
 *
 * 放在心愿单 Tab 的「收藏文章」视图里，但实现留在百科 feature：
 * 收藏的是百科内容，标题、摘要与分类都来自百科的本地文章集，
 * 心愿单只负责把它放在哪一屏（ARCHITECTURE 第三节）。
 *
 * 用 `FlatList` 而不是把卡片铺进 `ScrollView`：收藏会一直累积，
 * 只有虚拟化列表在条目变多后仍然滚得动（PRD-NFR-007）。
 */
export function FavoriteArticleList({ onOpenArticle, onBrowseCatalog }: FavoriteArticleListProps) {
  const { status, articles, reload } = useFavoriteArticles();

  const renderItem = useCallback(
    ({ item }: { item: FavoriteArticleSummary }) => (
      <FavoriteArticleCard article={item} onPress={() => onOpenArticle(item.slug)} />
    ),
    [onOpenArticle],
  );

  const firstLoad = status === 'loading' && articles === null;
  // 读取失败且一条都没拿到时不能显示「还没有收藏文章」——那是在断言一个我们并不
  // 知道的事实。此时只保留失败说明与重试入口。
  const failedWithoutData = status === 'error' && articles === null;

  return (
    <View style={styles.body}>
      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message={
            failedWithoutData
              ? '没能读取收藏文章。'
              : '没能刷新收藏文章，下面显示的可能不是最新内容。'
          }
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}

      {articles === null ? null : (
        <Text style={styles.summary} accessible>
          共 {articles.length} 篇收藏
        </Text>
      )}

      {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入收藏文章" /> : null}

      {!firstLoad && !failedWithoutData ? (
        <FlatList
          data={articles ?? []}
          keyExtractor={(item) => item.slug}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="bookmark"
              title="还没有收藏文章"
              description="在百科中收藏的内容会显示在这里。"
              actionLabel="去百科看看"
              onActionPress={onBrowseCatalog}
            />
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Layout.cardGap,
  },
  summary: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  list: {
    // 列表要占满摘要与底部之间的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.lg,
  },
});
