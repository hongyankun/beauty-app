import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { Chip, ChipRow, EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { RedemptionHistoryRow } from '../components/redemption-history-row';
import { useRedemptionHistory } from '../hooks/use-redemption-history';
import type {
  RedemptionHistoryEntry,
  RedemptionHistoryFilter,
  RedemptionHistorySection,
} from '../services/list-redemption-history';

const FILTERS: readonly { readonly value: RedemptionHistoryFilter; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'valid', label: '有效' },
  { value: 'voided', label: '已撤销' },
];

/** 三个筛选各自的空状态文案。空结果要说清楚是哪个筛选为空（PRD-REC-004）。 */
const EMPTY_TEXTS: Readonly<
  Record<RedemptionHistoryFilter, { readonly title: string; readonly description: string }>
> = {
  all: {
    title: '还没有核销记录',
    description: '做完一次项目后记录一次，这里会按月份保留每一条核销。',
  },
  valid: {
    title: '没有有效的核销记录',
    description: '已撤销的记录仍然保留着，切到「全部」或「已撤销」可以看到。',
  },
  voided: {
    title: '没有已撤销的核销记录',
    description: '撤销过的核销会保留在这里，并标注撤销时间与原因。',
  },
};

function filterLabel(filter: RedemptionHistoryFilter): string {
  return FILTERS.find((option) => option.value === filter)?.label ?? '全部';
}

/**
 * 完整核销历史中心。
 *
 * 用 `SectionList` 而不是把卡片铺进 `ScrollView`：核销记录会一直累积，
 * PRD-NFR-007 要求 3000 条仍可流畅滚动，只有虚拟化列表做得到；
 * 月份标题正好落在 section header 上（UI_REFERENCE 第 8.2 章）。
 *
 * 本页只看不改：不提供撤销、编辑与删除入口，撤销仍在套餐详情里完成
 * （任务书第八、十五节）。页面不写 SQL，数据全部来自 service（任务书第十一节）。
 */
export function RedemptionHistoryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<RedemptionHistoryFilter>('all');
  const { status, result, reload } = useRedemptionHistory(filter);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/records');
    }
  }, [router]);

  const openPurchase = useCallback(
    (purchaseId: string) => {
      // 记录 Tab 自己的栈，保留 Tab 栏（IA 第 4.3 节第 2 条）。
      // 套餐若在此期间被删除，详情页会显示「找不到这个套餐」并给出返回入口，
      // 不会崩溃（任务书第八节）。
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const openRedeemPicker = useCallback(() => {
    // 复用既有的快捷核销选择页，不在本页另起一套核销表单（任务书第十二节）。
    router.push('/redeem');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: RedemptionHistoryEntry }) => (
      <RedemptionHistoryRow entry={item} onPress={openPurchase} />
    ),
    [openPurchase],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: RedemptionHistorySection }) => <SectionHeader title={section.title} />,
    [],
  );

  const firstLoad = status === 'loading' && result === null;
  // 读取失败且一条都没拿到时不能显示「还没有核销记录」——那是在断言一个
  // 我们并不知道的事实。此时只保留失败说明与重试入口。
  const failedWithoutData = status === 'error' && result === null;

  // 摘要与空状态都跟着 `result.filter` 走，而不是当前选中的筛选：
  // 切换筛选后新结果到达之前，屏幕上还是上一份数据，说明文字必须和它对得上。
  const shownFilter = result?.filter ?? filter;

  return (
    <Screen title="核销历史" subtitle="所有套餐、所有项目的每一次核销。" onBack={goBack} scrollable={false}>
      <View style={styles.body}>
        <ChipRow accessibilityLabel="核销状态筛选">
          {FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </ChipRow>

        {status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              failedWithoutData
                ? '没能读取核销历史。'
                : '没能刷新核销历史，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {/* 条数来自真实查询结果，不做图表也不统计金额（任务书第九节）。 */}
        {result === null ? null : (
          <Text style={styles.summary} accessible>
            {filterLabel(shownFilter)}：共 {result.totalCount} 条
          </Text>
        )}

        {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入核销历史" /> : null}

        {!firstLoad && !failedWithoutData ? (
          <SectionList
            sections={result?.sections ?? []}
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
                title={EMPTY_TEXTS[shownFilter].title}
                description={EMPTY_TEXTS[shownFilter].description}
                // 只有「全部」为空才给动作：另外两个筛选下记录其实是存在的，
                // 给一个「记录一次」反而在引导用户做一件他没想做的事。
                actionLabel={shownFilter === 'all' ? '记录一次' : undefined}
                onActionPress={shownFilter === 'all' ? openRedeemPicker : undefined}
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
    // 列表要占满筛选条与页面底部之间的剩余高度，否则它会撑到内容的自然高度并溢出。
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
});
