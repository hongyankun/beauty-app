import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  InlineNotice,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { BeautyEventCard } from '@/features/events/components/beauty-event-card';
import type { BeautyEventCard as BeautyEventCardData } from '@/features/events/event-summary';
import { useBeautyEventCards } from '@/features/events/hooks/use-beauty-event-cards';
import { BorderWidth, Colors, Layout, Spacing, TextStyles } from '@/theme';
import { PurchaseCard } from '../components/purchase-card';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { useItemGroups } from '../hooks/use-item-groups';
import { usePurchaseList } from '../hooks/use-purchase-list';
import { parseRecordsView, RECORDS_VIEWS, type RecordsView } from '../records-view';
import type { ItemGroup, ItemGroupMember } from '../services/list-item-groups';
import {
  filterPurchaseScope,
  filterPurchaseSummaries,
  type PurchaseScope,
  type PurchaseStatusFilter,
  type PurchaseSummary,
} from '../services/list-purchases';

const FILTERS: readonly { readonly value: PurchaseStatusFilter; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待使用' },
  { value: 'completed', label: '已完成' },
];

const SCOPES: readonly { readonly value: PurchaseScope; readonly label: string }[] = [
  { value: 'available', label: '可用套餐' },
  { value: 'all', label: '全部购买' },
];

/**
 * 记录 Tab（BT-0024）：顶部一行单选 Chip 切换三个视图——套餐、项目、变美历史。
 *
 * - 当前视图保存在 `view` 查询参数（package / item / event），缺失或非法时回到「套餐」。
 *   点 Chip 用 `setParams` 更新参数，不往导航栈里 push 新页面；从详情返回时这一页没有卸载，视图原样保留。
 *   参数只是导航状态，不参与任何查询。
 * - 「可用套餐 / 全部购买」是套餐视图与项目视图共用的购买范围，只决定包不包含单次购买；
 *   套餐视图的「全部 / 待使用 / 已完成」与之独立，切换范围不重置状态筛选。变美历史不受范围影响。
 * - 变美历史以变美记录为单位；「查看全部核销记录」仍是使用记录维度的完整历史，两者并存。
 * - 购买范围、状态筛选与项目视图的展开状态都放在本页：三个视图切换时子视图会卸载，
 *   状态放在子视图里会在切回时被悄悄重置（BT-0024A）。
 *
 * 一页只有一个实心主按钮「添加套餐」。列表一律用 `FlatList`（PRD-NFR-007）。
 */
export function PurchaseListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const view = parseRecordsView(params.view);
  const [scope, setScope] = useState<PurchaseScope>('available');
  const [filter, setFilter] = useState<PurchaseStatusFilter>('all');
  /** 项目视图已展开的组，按稳定的分组键保存；只是页面状态，不写库、不进路由。 */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const selectView = useCallback(
    (next: RecordsView) => {
      if (next !== view) {
        router.setParams({ view: next });
      }
    },
    [router, view],
  );

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const openNewEvent = useCallback(() => {
    router.push('/event/new');
  }, [router]);

  return (
    <Screen title="记录" subtitle="管理买过的套餐、项目与每一次变美。" scrollable={false}>
      <View style={styles.body}>
        {/* 三个视图不显示数量角标；选中状态有对勾与读屏的 selected 状态，不只靠颜色。 */}
        <ChipRow accessibilityLabel="记录视图">
          {RECORDS_VIEWS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={view === option.value}
              onPress={() => selectView(option.value)}
            />
          ))}
        </ChipRow>

        {view === 'package' ? (
          <PackageView scope={scope} onScopeChange={setScope} filter={filter} onFilterChange={setFilter} />
        ) : null}
        {view === 'item' ? (
          <ItemView scope={scope} onScopeChange={setScope} expanded={expanded} onExpandedChange={setExpanded} />
        ) : null}
        {view === 'event' ? <EventView onCreate={openNewEvent} /> : null}
      </View>

      {/* Tab 栏本身已经包含底部安全区，这里不再叠加 inset，否则按钮会被顶高一截。 */}
      <View style={styles.footer}>
        <Button label="添加套餐" icon="plus" variant="primary" onPress={openNewPurchase} />
        {/* 次要入口用描边按钮，一屏仍只有一个实心主按钮（BT-0023 裁决 1）。 */}
        <Button label="记录一次变美" icon="treatment" onPress={openNewEvent} />
      </View>
    </Screen>
  );
}

type ScopeProps = {
  readonly scope: PurchaseScope;
  readonly onScopeChange: (scope: PurchaseScope) => void;
};

function ScopeChips({ scope, onScopeChange }: ScopeProps) {
  return (
    <ChipRow accessibilityLabel="购买范围">
      {SCOPES.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={scope === option.value}
          onPress={() => onScopeChange(option.value)}
        />
      ))}
    </ChipRow>
  );
}

type PackageViewProps = ScopeProps & {
  readonly filter: PurchaseStatusFilter;
  readonly onFilterChange: (filter: PurchaseStatusFilter) => void;
};

/** 套餐视图：购买范围 × 状态两组独立筛选。 */
function PackageView({ scope, onScopeChange, filter, onFilterChange: setFilter }: PackageViewProps) {
  const router = useRouter();
  const { status, summaries, reload } = usePurchaseList();

  const scoped = useMemo(() => filterPurchaseScope(summaries, scope), [summaries, scope]);
  const visible = useMemo(() => filterPurchaseSummaries(scoped, filter), [scoped, filter]);

  const openDetail = useCallback(
    (purchaseId: string) => {
      // 详情压在记录 Tab 自己的栈里，保留 Tab 栏（IA 第 4.3 节第 2 条）。
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const openHistory = useCallback(() => {
    router.push('/(tabs)/records/history');
  }, [router]);

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: PurchaseSummary }) => <PurchaseCard summary={item} onPress={openDetail} />,
    [openDetail],
  );

  const firstLoad = status === 'loading' && summaries.length === 0;
  const failedWithoutData = status === 'error' && summaries.length === 0;

  // 空状态区分「从未录入」「当前范围没有」与「当前状态筛选没有」（PRD-REC-004、UI_REFERENCE 第 8.2 章）。
  let emptyState;
  if (summaries.length === 0) {
    emptyState = (
      <EmptyState
        icon="records"
        title="还没有套餐"
        description="录入购买过的套餐后，可以在这里查看剩余次数与有效期。"
        actionLabel="添加第一个套餐"
        onActionPress={openNewPurchase}
      />
    );
  } else if (scoped.length === 0) {
    emptyState = (
      <EmptyState
        icon="inbox"
        title="可用套餐里还没有内容"
        description="目前只有单次购买。切换到「全部购买」可以查看它们。"
        actionLabel="查看全部购买"
        onActionPress={() => onScopeChange('all')}
      />
    );
  } else {
    emptyState = (
      <EmptyState
        icon="inbox"
        title="当前筛选没有购买"
        description="换一个状态筛选，或者查看全部。"
        actionLabel="查看全部"
        onActionPress={() => setFilter('all')}
      />
    );
  }

  return (
    <View style={styles.view}>
      <ScopeChips scope={scope} onScopeChange={onScopeChange} />
      <ChipRow accessibilityLabel="套餐状态">
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={filter === option.value}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ChipRow>

      {/* 核销历史的入口是区块标题右侧的文字按钮：次要入口，不与实心的「添加套餐」抢层级。 */}
      <SectionHeader title="套餐" actionLabel="查看全部核销记录" onActionPress={openHistory} />

      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message={failedWithoutData ? '没能读取套餐列表。' : '没能刷新套餐列表，下面显示的可能不是最新内容。'}
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}

      {firstLoad ? <PurchaseCardSkeleton /> : null}

      {!firstLoad && !failedWithoutData ? (
        <>
          <Text style={styles.count} accessible>
            共 {visible.length} 个
          </Text>
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={emptyState}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : null}
    </View>
  );
}

type ItemViewProps = ScopeProps & {
  readonly expanded: ReadonlySet<string>;
  readonly onExpandedChange: (update: (previous: ReadonlySet<string>) => ReadonlySet<string>) => void;
};

/** 项目视图：按目录项目在展示层分组，点组在当前页展开具体的套餐项目。 */
function ItemView({ scope, onScopeChange, expanded, onExpandedChange }: ItemViewProps) {
  const router = useRouter();
  const { status, groups, reload } = useItemGroups(scope);

  const toggle = useCallback((key: string) => {
    onExpandedChange((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [onExpandedChange]);

  const openPurchase = useCallback(
    (purchaseId: string) => {
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ItemGroup }) => (
      <ItemGroupCard
        group={item}
        expanded={expanded.has(item.key)}
        onToggle={toggle}
        onOpenPurchase={openPurchase}
      />
    ),
    [expanded, toggle, openPurchase],
  );

  const firstLoad = status === 'loading' && groups.length === 0;
  const failedWithoutData = status === 'error' && groups.length === 0;

  return (
    <View style={styles.view}>
      <ScopeChips scope={scope} onScopeChange={onScopeChange} />

      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message={failedWithoutData ? '没能读取项目。' : '没能刷新项目，下面显示的可能不是最新内容。'}
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}

      {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入项目" /> : null}

      {!firstLoad && !failedWithoutData ? (
        <>
          <Text style={styles.count} accessible>
            共 {groups.length} 个项目
          </Text>
          <FlatList
            data={groups}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            extraData={expanded}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              scope === 'available' ? (
                <EmptyState
                  icon="inbox"
                  title="可用套餐里还没有项目"
                  description="录入套餐后，这里会按项目汇总剩余次数。单次购买在「全部购买」里查看。"
                  actionLabel="查看全部购买"
                  onActionPress={() => onScopeChange('all')}
                />
              ) : (
                <EmptyState
                  icon="inbox"
                  title="还没有项目"
                  description="录入套餐或记录一次单独购买后，这里会按项目汇总剩余次数。"
                />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : null}
    </View>
  );
}

type ItemGroupCardProps = {
  readonly group: ItemGroup;
  readonly expanded: boolean;
  readonly onToggle: (key: string) => void;
  readonly onOpenPurchase: (purchaseId: string) => void;
};

/**
 * 一个项目组。组头整块是展开 / 收起按钮（读屏有 expanded 状态）；展开后每个具体套餐项目各是一个按钮，
 * 进入对应的购买详情。组头与具体项目是并列的兄弟节点，不嵌套，点击互不触发。
 */
function ItemGroupCard({ group, expanded, onToggle, onOpenPurchase }: ItemGroupCardProps) {
  const counts = `剩余 ${group.remaining} 次 · 已使用 ${group.used} 次 · ${group.members.length} 个购买项目`;
  return (
    <Card style={styles.groupCard}>
      <Pressable
        onPress={() => onToggle(group.key)}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}，${group.categoryLabel}，${counts}`}
        accessibilityHint={expanded ? '收起具体的购买项目' : '展开具体的购买项目'}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.groupHeader, pressed ? styles.pressed : null]}
      >
        <View style={styles.groupText}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.meta}>{group.categoryLabel}</Text>
          <Text style={styles.meta}>{counts}</Text>
        </View>
        <Text style={styles.toggleLabel}>{expanded ? '收起' : '展开'}</Text>
      </Pressable>

      {expanded
        ? group.members.map((member) => (
            <MemberRow key={member.purchaseItemId} member={member} onPress={onOpenPurchase} />
          ))
        : null}
    </Card>
  );
}

function MemberRow({ member, onPress }: { member: ItemGroupMember; onPress: (purchaseId: string) => void }) {
  const status = member.remaining > 0 ? `剩余 ${member.remaining} 次` : '已用完';
  const parts = [
    member.purchaseKind === 'single' ? '单次' : null,
    status,
    `已使用 ${member.used} 次`,
    member.expiresOn === null ? null : `有效期至 ${member.expiresOn}`,
  ].filter((part): part is string => part !== null);
  return (
    <Pressable
      onPress={() => onPress(member.purchaseId)}
      accessibilityRole="button"
      accessibilityLabel={`${member.purchaseName}，项目 ${member.itemName}，${parts.join('，')}，查看购买详情`}
      style={({ pressed }) => [styles.member, pressed ? styles.pressed : null]}
    >
      <Text style={styles.memberName}>{member.purchaseName}</Text>
      <Text style={styles.meta}>项目：{member.itemName}</Text>
      <Text style={styles.meta}>{parts.join(' · ')}</Text>
    </Pressable>
  );
}

/** 变美历史：一条变美记录一张卡片，点进事件详情。不受购买范围影响。 */
function EventView({ onCreate }: { onCreate: () => void }) {
  const router = useRouter();
  const { status, cards, reload } = useBeautyEventCards();

  const openEvent = useCallback(
    (eventId: string) => {
      router.push({ pathname: '/(tabs)/records/event/[eventId]', params: { eventId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: BeautyEventCardData }) => <BeautyEventCard card={item} onPress={openEvent} />,
    [openEvent],
  );

  const firstLoad = status === 'loading' && cards.length === 0;
  const failedWithoutData = status === 'error' && cards.length === 0;

  return (
    <View style={styles.view}>
      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message={failedWithoutData ? '没能读取变美历史。' : '没能刷新变美历史，下面显示的可能不是最新内容。'}
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}

      {firstLoad ? <PurchaseCardSkeleton accessibilityLabel="正在载入变美历史" /> : null}

      {!firstLoad && !failedWithoutData ? (
        <>
          <Text style={styles.count} accessible>
            共 {cards.length} 次变美
          </Text>
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="calendar"
                title="还没有变美记录"
                description="记录一次变美后，这里会按日期列出每一次到店。"
                actionLabel="记录一次变美"
                onActionPress={onCreate}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Layout.cardGap,
  },
  view: {
    flex: 1,
    gap: Layout.cardGap,
  },
  count: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
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
    gap: Layout.tightGap,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  groupCard: {
    gap: Layout.cardGap,
  },
  groupHeader: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
  },
  groupText: {
    flex: 1,
    gap: Layout.tightGap,
  },
  groupName: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  member: {
    minHeight: Layout.minTouchSize,
    gap: Layout.tightGap,
    paddingTop: Layout.labelGap,
    borderTopWidth: BorderWidth.hairline,
    borderTopColor: Colors.borderLight,
  },
  toggleLabel: {
    ...TextStyles.label,
    color: Colors.mintStrong,
  },
  memberName: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
