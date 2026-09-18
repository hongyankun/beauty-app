import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { ExpiringPurchaseCard } from '../components/expiring-purchase-card';
import { useExpiringPurchases } from '../hooks/use-expiring-purchases';
import {
  EXPIRING_WINDOW_DAYS,
  type ExpiringPurchase,
  type ExpiringPurchaseResult,
} from '../services/list-expiring-purchases';

type Section = {
  readonly key: string;
  readonly title: string;
  readonly data: readonly ExpiringPurchase[];
};

/**
 * 两个区块：已过期在前，30 天内到期（含今天到期）在后（任务书第八节）。
 * 空的那一段整段不显示，避免出现一个只有标题的空区块。
 */
function toSections(result: ExpiringPurchaseResult | null): Section[] {
  if (result === null) {
    return [];
  }
  const sections: Section[] = [];
  if (result.expired.length > 0) {
    sections.push({ key: 'expired', title: '已过期', data: result.expired });
  }
  if (result.dueSoon.length > 0) {
    sections.push({
      key: 'due-soon',
      title: `${EXPIRING_WINDOW_DAYS}天内到期`,
      data: result.dueSoon,
    });
  }
  return sections;
}

/**
 * 完整临期提醒页。
 *
 * 用 `SectionList` 而不是把卡片铺进 `ScrollView`：套餐数量会一直增长，
 * PRD-NFR-007 要求 500 个套餐下仍可流畅滚动，只有虚拟化列表做得到。
 *
 * 本页只读：不核销、不编辑、不改有效期，点击整行进入套餐详情。
 * 已过期的套餐同样可点、同样能在详情里继续核销（ADR-017）。
 */
export function ExpiringPurchasesScreen() {
  const router = useRouter();
  const { status, result, reload } = useExpiringPurchases();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  }, [router]);

  const openPurchase = useCallback(
    (purchaseId: string) => {
      // 套餐详情在记录 Tab 的栈里，保留 Tab 栏（IA 第 4.3 节第 2 条）。
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const sections = useMemo(() => toSections(result), [result]);

  const renderItem = useCallback(
    ({ item }: { item: ExpiringPurchase }) => (
      <ExpiringPurchaseCard purchase={item} onPress={openPurchase} />
    ),
    [openPurchase],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => <SectionHeader title={section.title} />,
    [],
  );

  const firstLoad = status === 'loading' && result === null;
  // 读取失败且一条都没拿到时不能显示「暂无临期套餐」——那是在断言一个
  // 我们并不知道的事实。此时只保留失败说明与重试入口（任务书第十二节）。
  const failedWithoutData = status === 'error' && result === null;

  return (
    <Screen
      title="临期提醒"
      subtitle={`有效期在未来 ${EXPIRING_WINDOW_DAYS} 天内、以及已过期但还有剩余次数的套餐。`}
      onBack={goBack}
      scrollable={false}
    >
      <View style={styles.body}>
        {status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              failedWithoutData
                ? '没能读取临期提醒。'
                : '没能刷新临期提醒，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {/* 条数来自真实查询结果，不做估算，也不做图表（任务书第九节）。 */}
        {result === null ? null : (
          <Text style={styles.summary} accessible>
            共 {result.totalCount} 个套餐
          </Text>
        )}

        {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入临期提醒" /> : null}

        {!firstLoad && !failedWithoutData ? (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="calendar"
                title="暂无临期套餐"
                description={`未来 ${EXPIRING_WINDOW_DAYS} 天没有需要提醒且仍有剩余次数的套餐。`}
              />
            }
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
  summary: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  list: {
    // 列表要占满摘要行与页面底部之间的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
});
