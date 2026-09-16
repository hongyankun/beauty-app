import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, InlineNotice, Screen, SectionHeader } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import { PurchaseCardSkeleton } from '../components/purchase-card-skeleton';
import { PurchaseItemCard } from '../components/purchase-item-card';
import { RedemptionRow } from '../components/redemption-row';
import { usePurchaseDetail } from '../hooks/use-purchase-detail';
import type {
  PurchaseDetail,
  PurchaseDetailRedemption,
} from '../services/get-purchase-detail';

/**
 * 套餐详情。
 *
 * 用 `FlatList` 承载核销历史，套餐信息与项目列表放进 `ListHeaderComponent`：
 * 一个套餐的项目通常只有几个，而核销记录会一直累积，需要虚拟化的是后者
 * （PRD-NFR-007）。项目卡片若也铺进列表，就要把两种完全不同的行混在同一个
 * `data` 里，反而更难读。
 *
 * 余次不在这里计算，由 `getPurchaseDetail` 从数据库派生（ARCHITECTURE 第三节）。
 */
export function PurchaseDetailScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const { status, detail, reload } = usePurchaseDetail(purchaseId);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/records');
    }
  }, [router]);

  const openRedemption = useCallback(
    (purchaseItemId: string) => {
      // 路由只带 ID，不把业务对象塞进参数（任务书第五节）；
      // `purchaseId` 用于保存成功后准确返回到这个详情页。
      router.push({
        pathname: '/redeem/[purchaseItemId]',
        params: { purchaseItemId, purchaseId },
      });
    },
    [router, purchaseId],
  );

  const renderRedemption = useCallback(
    ({ item }: { item: PurchaseDetailRedemption }) => <RedemptionRow redemption={item} />,
    [],
  );

  if (status === 'loading' && detail === null) {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <PurchaseCardSkeleton />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <EmptyState
          icon="inbox"
          title="找不到这个套餐"
          description="它可能已经被删除了。返回列表看看其他套餐。"
          actionLabel="返回列表"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen title="套餐详情" onBack={goBack}>
        <InlineNotice
          tone="warning"
          message="没能读取这个套餐。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  return (
    <Screen title={detail.name} onBack={goBack} scrollable={false}>
      <FlatList
        data={detail.redemptions}
        keyExtractor={(item) => item.id}
        renderItem={renderRedemption}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            {status === 'error' ? (
              <InlineNotice
                tone="warning"
                message="没能刷新这个套餐，下面显示的可能不是最新内容。"
                actionLabel="重试"
                onActionPress={reload}
              />
            ) : null}

            <PurchaseSummaryCard detail={detail} />

            <SectionHeader title={`项目（${detail.itemCount}）`} />
            <View style={styles.items}>
              {detail.items.map((item) => (
                <PurchaseItemCard key={item.id} item={item} onRedeem={openRedemption} />
              ))}
            </View>

            <SectionHeader title="核销历史" />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar"
            title="还没有核销记录"
            description="做完一次项目后，在上面的项目里点「核销一次」，这里就会留下记录。"
          />
        }
      />
    </Screen>
  );
}

/**
 * 套餐层的信息与合计。选填字段没有值时整行不展示（任务书第六节）。
 *
 * 三项合计与其余信息用同一种行排版：它们是同一层级的事实，
 * 单独做成一排缩写数字反而让「总购买 / 已核销 / 总剩余」的完整含义读不出来。
 * 数值全部来自 `getPurchaseDetail` 的派生结果，这里不重新计算。
 */
function PurchaseSummaryCard({ detail }: { detail: PurchaseDetail }) {
  return (
    <Card style={styles.summary}>
      <Row label="机构" value={detail.institutionName ?? '未填写机构'} />
      {detail.city ? <Row label="城市" value={detail.city} /> : null}
      <Row label="购买日期" value={detail.purchaseDate} />
      <Row label="总价" value={formatMinorAsYuan(detail.totalAmountMinor)} />
      {detail.expiresOn ? <Row label="有效期" value={`至 ${detail.expiresOn}`} /> : null}
      <Row label="项目总数" value={`${detail.itemCount} 个`} />
      <Row label="总购买次数" value={`${detail.totalQuantity} 次`} />
      <Row label="已核销次数" value={`${detail.redeemedCount} 次`} />
      <Row label="总剩余次数" value={`${detail.remaining} 次`} emphasized />
      {detail.notes ? <Row label="备注" value={detail.notes} /> : null}
    </Card>
  );
}

/**
 * 摘要卡里的一行。
 *
 * 整行合并成一个读屏节点，这样 VoiceOver 读到的是「总剩余次数 3 次」，
 * 而不是把标签和数字拆成两段（PRD-NFR-004）。
 */
function Row({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasized ? styles.rowValueEmphasized : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    gap: Layout.cardGap,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Layout.cardGap,
    paddingBottom: Layout.tightGap,
  },
  items: {
    gap: Layout.cardGap,
  },
  summary: {
    gap: Layout.labelGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  rowLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  rowValue: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmphasized: {
    ...TextStyles.bodyStrong,
  },
});
