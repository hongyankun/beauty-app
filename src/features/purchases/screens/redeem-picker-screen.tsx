import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, InlineNotice, Screen } from '@/components/ui';
import { Layout, Spacing } from '@/theme';
import { todayBusinessDate } from '@/utils/business-date';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { RedeemableItemCard } from '../components/redeemable-item-card';
import { useRedeemableItems } from '../hooks/use-redeemable-items';
import { isExpiredOn, type RedeemableItem } from '../services/list-redeemable-items';

/**
 * 快捷核销的第一步：选择项目（IA 第 3.6.3 节「从首页进入时需先选」）。
 *
 * 这一页只负责选择。选中后进入**已有的**核销表单
 * `/redeem/[purchaseItemId]`，不复制第二套表单；路由上只带两个 ID，
 * 不传整个业务对象，表单会自己按 ID 重新读取最新的项目与余次。
 */
export function RedeemPickerScreen() {
  const router = useRouter();
  const { status, items, reload } = useRedeemableItems();

  // 「已过有效期」按进入页面时的今天判断即可：这是一句事实陈述，
  // 不参与任何计算，没必要随时钟跳动重算。
  const today = useMemo(() => todayBusinessDate(), []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  }, [router]);

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const openRedemption = useCallback(
    (item: RedeemableItem) => {
      router.push({
        pathname: '/redeem/[purchaseItemId]',
        params: { purchaseItemId: item.purchaseItemId, purchaseId: item.purchaseId },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: RedeemableItem }) => (
      <RedeemableItemCard
        item={item}
        expired={isExpiredOn(item.expiresOn, today)}
        onPress={openRedemption}
      />
    ),
    [openRedemption, today],
  );

  const firstLoad = status === 'loading' && items.length === 0;
  // 读取失败且一条都没拿到时不能说「暂无可记录的项目」——那是在断言一个
  // 我们并不知道的事实。此时只保留失败提示与重试入口。
  const failedWithoutData = status === 'error' && items.length === 0;

  return (
    <Screen
      title="记录一次"
      subtitle="选择这次做的项目，只列出还有剩余次数的。"
      onBack={goBack}
      backLabel="取消"
      scrollable={false}
    >
      <View style={styles.body}>
        {status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              items.length === 0
                ? '没能读取可以记录的项目。'
                : '没能刷新项目列表，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入可以记录的项目" /> : null}

        {!firstLoad && !failedWithoutData ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.purchaseItemId}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              // 没有可记录的项目时给出一条真正能走的路，而不是一个灰掉的按钮
              // （任务书第五节；UI_REFERENCE 第 11 章：空状态要带一个动作）。
              <EmptyState
                icon="inbox"
                title="暂无可记录的项目"
                description="这里只列出还有剩余次数的项目。先添加一个还有剩余次数的套餐，就可以在这里记录了。"
                actionLabel="添加套餐"
                onActionPress={openNewPurchase}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        ) : null}
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
    // 列表要占满提示条以下的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
});
