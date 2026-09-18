import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Chip, ChipRow, EmptyState, Screen } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { ArticleCard } from '../components/article-card';
import { ArticleSearchBox } from '../components/article-search-box';
import { useArticleBrowser } from '../hooks/use-article-browser';
import type { CategoryFilter } from '../services/search-articles';
import { ARTICLE_CATEGORIES, type EncyclopediaArticle } from '../types';

/** 「全部」在最前，其后是四个浏览分类，顺序固定。 */
const CATEGORY_FILTERS: readonly { code: CategoryFilter; name: string }[] = [
  { code: 'all', name: '全部' },
  ...ARTICLE_CATEGORIES.map((category) => ({
    code: category.code as CategoryFilter,
    name: category.name,
  })),
];

/**
 * 百科首页。
 *
 * 内容随 App 本地打包，没有网络请求，因此没有加载态与失败重试。
 * 列表用 `FlatList`：条目会持续增加，不能一次性铺进 `ScrollView`。
 *
 * 这里没有推荐、猜你喜欢、按套餐推断或效果排名，结果顺序永远是编辑顺序
 * （任务书第九节、第十节）。
 */
export function CatalogHomeScreen() {
  const router = useRouter();
  const {
    keyword,
    setKeyword,
    category,
    setCategory,
    results,
    hasFilters,
    clearFilters,
    isLibraryEmpty,
  } = useArticleBrowser();

  const openArticle = useCallback(
    (article: EncyclopediaArticle) => {
      router.push(`/(tabs)/catalog/${article.slug}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: EncyclopediaArticle }) => (
      <ArticleCard article={item} onPress={() => openArticle(item)} />
    ),
    [openArticle],
  );

  return (
    <Screen
      title="医美百科"
      subtitle="了解常见项目与护理知识，帮助你更好地记录和沟通。"
      scrollable={false}
    >
      <View style={styles.body}>
        {isLibraryEmpty ? (
          <EmptyState
            icon="catalog"
            title="百科内容正在整理中"
            description="内容完成核验后会随 App 更新一起提供。"
          />
        ) : (
          <>
            <View style={styles.filters}>
              <ArticleSearchBox value={keyword} onChangeText={setKeyword} />
              <ChipRow accessibilityLabel="按分类筛选">
                {CATEGORY_FILTERS.map((filter) => (
                  <Chip
                    key={filter.code}
                    label={filter.name}
                    selected={category === filter.code}
                    onPress={() => setCategory(filter.code)}
                  />
                ))}
              </ChipRow>
            </View>

            <Text style={styles.count} accessible>
              共 {results.length} 篇内容
            </Text>

            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              // 键盘弹出时点击卡片应当直接生效，而不是先被吞掉一次用来收键盘。
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                <EmptyState
                  icon="search"
                  title="没有找到相关内容"
                  description="试试更换关键词或选择其他分类。"
                  actionLabel={hasFilters ? '清除筛选' : undefined}
                  onActionPress={hasFilters ? clearFilters : undefined}
                />
              }
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Layout.cardGap,
  },
  filters: {
    gap: Layout.cardGap,
  },
  count: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  list: {
    // 列表占满筛选区与页面底部之间的剩余高度，否则会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
});
