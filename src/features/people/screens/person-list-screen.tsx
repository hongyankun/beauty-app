import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, InlineNotice, Screen } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { PersonCard } from '../components/person-card';
import { usePersonList } from '../hooks/use-person-list';
import type { PersonFilter } from '../services/list-people';
import type { PersonSummary } from '../services/person-view';

const FILTERS: readonly { readonly value: PersonFilter; readonly label: string }[] = [
  { value: 'active', label: '使用中' },
  { value: 'archived', label: '已归档' },
];

/**
 * 两个筛选各自的空状态。「使用中」永远至少有「自己」，
 * 这里的空状态只在读到空结果（理论上不会发生）时兜底。
 */
const EMPTY_TEXTS: Readonly<
  Record<PersonFilter, { readonly title: string; readonly description: string }>
> = {
  active: {
    title: '还没有使用中的人',
    description: '添加家人或朋友后，记录套餐与使用时可以选择他们。',
  },
  archived: {
    title: '还没有已归档的人',
    description: '归档后的人不再出现在选择列表里，已有记录照常显示。',
  },
};

function filterLabel(filter: PersonFilter): string {
  return FILTERS.find((option) => option.value === filter)?.label ?? '使用中';
}

/**
 * 使用人管理（我的 Tab 自己的栈内，保留 Tab 栏）。
 *
 * 同一档案下可以记录多个人，但这不是多档案：没有档案切换，也不为每个人分出
 * 独立数据（PRD 第 5B.4 节）。每个人只有一个名称，不收集任何其他个人信息。
 */
export function PersonListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<PersonFilter>('active');
  const { status, result, reload } = usePersonList(filter);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/me');
    }
  }, [router]);

  const openPerson = useCallback(
    (personId: string) => {
      router.push({ pathname: '/(tabs)/me/people/[personId]', params: { personId } });
    },
    [router],
  );

  const addPerson = useCallback(() => {
    router.push('/(tabs)/me/people/new');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: PersonSummary }) => <PersonCard person={item} onPress={openPerson} />,
    [openPerson],
  );

  const firstLoad = status === 'loading' && result === null;
  const failedWithoutData = status === 'error' && result === null;
  const shownFilter = result?.filter ?? filter;

  return (
    <Screen
      title="使用人管理"
      subtitle="记录套餐的购买人和每次项目的使用人。"
      onBack={goBack}
      scrollable={false}
    >
      <View style={styles.body}>
        <ChipRow accessibilityLabel="使用人状态筛选">
          {FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </ChipRow>

        <Button label="添加使用人" variant="primary" icon="plus" onPress={addPerson} />

        {status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              failedWithoutData
                ? '没能读取使用人列表。'
                : '没能刷新使用人列表，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={reload}
          />
        ) : null}

        {result === null ? null : (
          <Text style={styles.summary} accessible>
            {filterLabel(shownFilter)}：共 {result.totalCount} 人
          </Text>
        )}

        {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入使用人列表" /> : null}

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
                icon="people"
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
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
});
