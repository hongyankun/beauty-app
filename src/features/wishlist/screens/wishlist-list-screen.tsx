import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, InlineNotice, Screen } from '@/components/ui';
import { FavoriteArticleList } from '@/features/catalog/components/favorite-article-list';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { WishlistCard } from '../components/wishlist-card';
import { useWishlistList } from '../hooks/use-wishlist-list';
import type { WishlistItemSummary } from '../wishlist-view';

/** 本页的两个视图。默认停在心愿项目上。 */
type WishlistView = 'wishes' | 'favorites';

/**
 * 心愿单列表（心愿单 Tab 的一级页面）。
 *
 * 两个视图：**心愿项目**（用户自己记下的项目）与**收藏文章**（在百科里收藏的内容）。
 * 两者都是「以后还想看 / 还想做」的东西，放在同一个 Tab 下，用单选的视图切换
 * 而不是第二个 Tab（任务书第九节）。
 *
 * 这里**没有推荐、没有猜你喜欢、没有按记录推断**的任何内容
 * （PROJECT_BRIEF 第 6 节、ADR-009），也不出现倒计时与促销式强调（UI_REFERENCE 第 15 章）。
 *
 * 用 `FlatList` 而不是把卡片铺进 `ScrollView`：心愿会随使用一直累积，
 * 只有虚拟化列表在条目变多后仍然滚得动（PRD-NFR-007）。
 */
export function WishlistListScreen() {
  const router = useRouter();
  const { status, items, reload } = useWishlistList();
  /**
   * 视图选择放在页面状态里。
   *
   * 点进文章或表单再返回时本页不会卸载，所以一次正常往返回来还停在原来的视图；
   * 冷启动回到默认的「心愿项目」，本轮不做持久化（任务书第 9.4 节）。
   */
  const [view, setView] = useState<WishlistView>('wishes');

  const openWish = useCallback(
    (wishId: string) => {
      // 编辑页在根 Stack 上，覆盖 Tab 栏；列表页自己留在心愿单 Tab 内。
      router.push({ pathname: '/wishlist/[wishId]/edit', params: { wishId } });
    },
    [router],
  );

  const addWish = useCallback(() => {
    router.push('/wishlist/new');
  }, [router]);

  const openArticle = useCallback(
    (slug: string) => {
      // 走心愿单栈自己的薄路由：渲染的仍是百科那一个 `ArticleDetailScreen`，
      // 但详情压在本 Tab 的栈上，所以页面返回按钮、iOS 侧滑与 Android 返回键
      // 都会落回这一屏（IA 第 3.4.4、4 节）。
      router.push({
        pathname: '/(tabs)/wishlist/article/[entryId]',
        params: { entryId: slug },
      });
    },
    [router],
  );

  const browseCatalog = useCallback(() => {
    router.navigate('/(tabs)/catalog');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: WishlistItemSummary }) => <WishlistCard item={item} onPress={openWish} />,
    [openWish],
  );

  const firstLoad = status === 'loading' && items === null;
  // 读取失败且一条都没拿到时不能显示「还没有心愿」——那是在断言一个我们并不知道的
  // 事实。此时只保留失败说明与重试入口。
  const failedWithoutData = status === 'error' && items === null;
  const showingWishes = view === 'wishes';

  return (
    <Screen
      title="心愿单"
      subtitle="记录想了解和打算做的项目，收藏的百科文章也在这里。"
      scrollable={false}
    >
      <View style={styles.body}>
        <ChipRow accessibilityLabel="选择要查看的内容">
          <Chip label="心愿项目" selected={showingWishes} onPress={() => setView('wishes')} />
          <Chip label="收藏文章" selected={!showingWishes} onPress={() => setView('favorites')} />
        </ChipRow>

        {showingWishes ? (
          <View style={styles.body}>
            {status === 'error' ? (
              <InlineNotice
                tone="warning"
                message={
                  failedWithoutData
                    ? '没能读取心愿单。'
                    : '没能刷新心愿单，下面显示的可能不是最新内容。'
                }
                actionLabel="重试"
                onActionPress={reload}
              />
            ) : null}

            {items === null ? null : (
              <Text style={styles.summary} accessible>
                共 {items.length} 条心愿
              </Text>
            )}

            {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入心愿单" /> : null}

            {!firstLoad && !failedWithoutData ? (
              <FlatList
                data={items ?? []}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <EmptyState
                    icon="wishlist"
                    title="还没有心愿"
                    description="把想了解的项目加进来，可以记下意向机构、心理预算和打算什么时候去。"
                    actionLabel="添加心愿"
                    onActionPress={addWish}
                  />
                }
              />
            ) : null}
          </View>
        ) : (
          <FavoriteArticleList onOpenArticle={openArticle} onBrowseCatalog={browseCatalog} />
        )}
      </View>

      {/*
        全屏唯一的实心主按钮（UI_REFERENCE 第 10 章）；空状态里的那个是次按钮。
        只在心愿项目视图出现：收藏文章只能在百科里收藏，这一屏没有「新增收藏」这回事。
        Tab 栏本身已经包含底部安全区，这里不再叠加 inset，否则按钮会被顶高一截。
      */}
      {showingWishes ? (
        <View style={styles.footer}>
          <Button label="添加心愿" icon="plus" variant="primary" onPress={addWish} />
        </View>
      ) : null}
    </Screen>
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
    // 列表要占满摘要与底部按钮之间的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    // 心愿单的卡片间距比记录列表更松一些（UI_REFERENCE 第 13 章）。
    gap: Layout.cardGap,
    paddingBottom: Spacing.lg,
  },
  footer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
