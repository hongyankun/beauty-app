import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Chip, ChipRow, EmptyState, InlineNotice, Screen } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { InstitutionCard } from '../components/institution-card';
import { useInstitutionList } from '../hooks/use-institution-list';
import type { InstitutionFilter } from '../services/list-institutions';
import type { InstitutionSummary } from '../services/institution-view';

const FILTERS: readonly { readonly value: InstitutionFilter; readonly label: string }[] = [
  { value: 'active', label: '使用中' },
  { value: 'archived', label: '已归档' },
];

/** 两个筛选各自的空状态。已归档为空时不给按钮——没有任何值得做的下一步。 */
const EMPTY_TEXTS: Readonly<
  Record<InstitutionFilter, { readonly title: string; readonly description: string }>
> = {
  active: {
    title: '还没有使用中的机构',
    description: '新增套餐或记录核销时填写的机构会出现在这里。',
  },
  archived: {
    title: '还没有已归档的机构',
    description: '归档后的机构不再出现在选择列表里，但已有套餐与核销记录都会保留。',
  },
};

function filterLabel(filter: InstitutionFilter): string {
  return FILTERS.find((option) => option.value === filter)?.label ?? '使用中';
}

/**
 * 机构管理中心（我的 Tab 自己的栈内，保留 Tab 栏）。
 *
 * 这里只整理已经存在的机构：机构仍然只在新增套餐、编辑套餐与新增核销时
 * 创建或复用，本页没有「新增机构」入口（任务书第十一节）。
 *
 * 用 `FlatList` 而不是把卡片铺进 `ScrollView`：机构会随使用一直累积，
 * 只有虚拟化列表在条目变多后仍然滚得动（PRD-NFR-007）。
 */
export function InstitutionListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<InstitutionFilter>('active');
  const { status, result, reload } = useInstitutionList(filter);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me');
    }
  }, [router]);

  const openInstitution = useCallback(
    (institutionId: string) => {
      router.push({
        pathname: '/(tabs)/me/institutions/[institutionId]',
        params: { institutionId },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: InstitutionSummary }) => (
      <InstitutionCard institution={item} onPress={openInstitution} />
    ),
    [openInstitution],
  );

  const firstLoad = status === 'loading' && result === null;
  // 读取失败且一条都没拿到时不能显示「还没有使用中的机构」——那是在断言一个
  // 我们并不知道的事实。此时只保留失败说明与重试入口。
  const failedWithoutData = status === 'error' && result === null;

  // 摘要与空状态跟着 `result.filter` 走而不是当前选中的筛选：切换筛选后新结果
  // 到达之前，屏幕上还是上一份数据，说明文字必须和它对得上。
  const shownFilter = result?.filter ?? filter;

  return (
    <Screen
      title="机构管理"
      subtitle="整理套餐和核销中使用过的机构。"
      onBack={goBack}
      scrollable={false}
    >
      <View style={styles.body}>
        <ChipRow accessibilityLabel="机构状态筛选">
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
                ? '没能读取机构列表。'
                : '没能刷新机构列表，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {result === null ? null : (
          <Text style={styles.summary} accessible>
            {filterLabel(shownFilter)}：共 {result.totalCount} 个机构
          </Text>
        )}

        {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入机构列表" /> : null}

        {!firstLoad && !failedWithoutData ? (
          <FlatList
            data={result?.entries ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="institution"
                title={EMPTY_TEXTS[shownFilter].title}
                description={EMPTY_TEXTS[shownFilter].description}
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
