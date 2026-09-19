import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, InlineNotice, Screen } from '@/components/ui';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { WishlistCard } from '../components/wishlist-card';
import { useWishlistList } from '../hooks/use-wishlist-list';
import type { WishlistItemSummary } from '../wishlist-view';

/**
 * 心愿单列表（心愿单 Tab 的一级页面）。
 *
 * 只列出用户自己记下的项目，按最近更新排在前面。这里**没有推荐、没有猜你喜欢、
 * 没有按记录推断**的任何内容（PROJECT_BRIEF 第 6 节、ADR-009），
 * 也不出现倒计时与促销式强调（UI_REFERENCE 第 15 章）。
 *
 * 用 `FlatList` 而不是把卡片铺进 `ScrollView`：心愿会随使用一直累积，
 * 只有虚拟化列表在条目变多后仍然滚得动（PRD-NFR-007）。
 */
export function WishlistListScreen() {
  const router = useRouter();
  const { status, items, reload } = useWishlistList();

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

  const renderItem = useCallback(
    ({ item }: { item: WishlistItemSummary }) => <WishlistCard item={item} onPress={openWish} />,
    [openWish],
  );

  const firstLoad = status === 'loading' && items === null;
  // 读取失败且一条都没拿到时不能显示「还没有心愿」——那是在断言一个我们并不知道的
  // 事实。此时只保留失败说明与重试入口。
  const failedWithoutData = status === 'error' && items === null;

  return (
    <Screen title="心愿单" subtitle="记录想了解和打算做的项目。" scrollable={false}>
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

      {/*
        全屏唯一的实心主按钮（UI_REFERENCE 第 10 章）；空状态里的那个是次按钮。
        Tab 栏本身已经包含底部安全区，这里不再叠加 inset，否则按钮会被顶高一截。
      */}
      <View style={styles.footer}>
        <Button label="添加心愿" icon="plus" variant="primary" onPress={addWish} />
      </View>
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
