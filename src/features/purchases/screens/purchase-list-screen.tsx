import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Layout, Spacing } from '@/theme';
import { PurchaseCard } from '../components/purchase-card';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { usePurchaseList } from '../hooks/use-purchase-list';
import {
  filterPurchaseSummaries,
  type PurchaseStatusFilter,
  type PurchaseSummary,
} from '../services/list-purchases';

const FILTERS: readonly { readonly value: PurchaseStatusFilter; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待使用' },
  { value: 'completed', label: '已完成' },
];

/**
 * 记录列表。
 *
 * 用 `FlatList` 而不是把卡片铺进 `ScrollView`：PRD-NFR-007 要求 500 个套餐仍可流畅滚动，
 * 只有虚拟化列表能做到，因此外层 `Screen` 关掉自身滚动，由这里接管内容区高度。
 */
export function PurchaseListScreen() {
  const router = useRouter();
  const { status, summaries, reload } = usePurchaseList();
  const [filter, setFilter] = useState<PurchaseStatusFilter>('all');

  const visible = useMemo(
    () => filterPurchaseSummaries(summaries, filter),
    [summaries, filter],
  );

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const clearFilter = useCallback(() => {
    setFilter('all');
  }, []);

  const openDetail = useCallback(
    (purchaseId: string) => {
      // 详情压在记录 Tab 自己的栈里，保留 Tab 栏（IA 第 4.3 节第 2 条）。
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const openHistory = useCallback(() => {
    // 同样压在记录 Tab 的栈里，Tab 栏保持显示；返回时本页的筛选状态还在，
    // 因为这个页面并没有被卸载（任务书第三节）。
    router.push('/(tabs)/records/history');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: PurchaseSummary }) => (
      <PurchaseCard summary={item} onPress={openDetail} />
    ),
    [openDetail],
  );

  const firstLoad = status === 'loading' && summaries.length === 0;
  // 读取失败且一条数据都没拿到时，不能展示「还没有套餐」——那是在断言一个
  // 我们并不知道的事实。此时只保留上面的失败提示与重试入口。
  const failedWithoutData = status === 'error' && summaries.length === 0;

  // 空状态必须区分「从未录入」与「当前筛选无结果」（PRD-REC-004、UI_REFERENCE 第 8.2 章）。
  const emptyState =
    summaries.length === 0 ? (
      <EmptyState
        icon="records"
        title="还没有套餐"
        description="录入购买过的套餐后，可以在这里查看剩余次数与有效期。"
        actionLabel="添加第一个套餐"
        onActionPress={openNewPurchase}
      />
    ) : (
      <EmptyState
        icon="inbox"
        title="当前筛选没有套餐"
        description="换一个筛选条件，或者查看全部套餐。"
        actionLabel="查看全部"
        onActionPress={clearFilter}
      />
    );

  return (
    <Screen title="记录" subtitle="管理买过的套餐与每一次核销。" scrollable={false}>
      <View style={styles.body}>
        <ChipRow accessibilityLabel="套餐筛选">
          {FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </ChipRow>

        {/*
          核销历史的入口做成区块标题右侧的文字按钮：它是次要入口，
          不能和底部那个实心的「添加套餐」抢层级，一屏也只允许一个实心主按钮
          （UI_REFERENCE 第 10 章、任务书第三节）。
        */}
        <SectionHeader title="套餐" actionLabel="查看全部核销记录" onActionPress={openHistory} />

        {status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              summaries.length === 0
                ? '没能读取套餐列表。'
                : '没能刷新套餐列表，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {firstLoad ? <PurchaseCardSkeleton /> : null}

        {!firstLoad && !failedWithoutData ? (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={emptyState}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </View>

      {/* Tab 栏本身已经包含底部安全区，这里不再叠加 inset，否则按钮会被顶高一截。 */}
      <View style={styles.footer}>
        <Button label="添加套餐" icon="plus" variant="primary" onPress={openNewPurchase} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Layout.cardGap,
  },
  list: {
    // 列表要占满筛选条与底部按钮之间的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.lg,
  },
  footer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
