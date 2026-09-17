import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, InlineNotice, Screen, SectionHeader, StatCard } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import { RecentRedemptionCard } from '../components/recent-redemption-card';
import { useHomeDashboard } from '../hooks/use-home-dashboard';

/** 数字还没读到时的占位。只在首次加载与「一次都没读成功」时出现。 */
const NO_VALUE = '—';

/**
 * 首页总览。
 *
 * 只回答两个问题：还剩多少次没用，一共花了多少钱；再加上最近做过什么
 * （PRD 第 8 章、IA 第 3.1.1 节）。图表、月度趋势、临期提醒不在本轮范围内。
 *
 * 数据每次页面获得焦点时重读，所以在别处新增套餐、核销、撤销核销或删除套餐后
 * 回到首页，数字与最近记录都会跟着变（PRD-HOME-004、PRD-RED-002）。
 */
export function HomeScreen() {
  const router = useRouter();
  const { status, dashboard, reload } = useHomeDashboard();

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const openRedeemPicker = useCallback(() => {
    router.push('/redeem');
  }, [router]);

  const openPurchase = useCallback(
    (purchaseId: string) => {
      router.push(`/(tabs)/records/${purchaseId}`);
    },
    [router],
  );

  const firstLoad = dashboard === null && status === 'loading';
  // 读取失败且一次都没读到数据时，不能显示 0 次 / ¥0.00——那是在断言一个
  // 我们并不知道的事实。此时保留占位符，只给出失败说明与重试。
  const failedWithoutData = dashboard === null && status === 'error';
  const staleData = dashboard !== null && status === 'error';

  const statHint = firstLoad ? '正在载入' : failedWithoutData ? '暂时读不到' : null;

  const pendingText = dashboard === null ? NO_VALUE : String(dashboard.pendingCount);
  const spendText = dashboard === null ? NO_VALUE : formatMinorAsYuan(dashboard.totalSpendMinor);
  const recent = dashboard?.recentRedemptions ?? [];

  return (
    <Screen title="你好" subtitle="把每一次护理，都认真记录下来">
      {status === 'error' ? (
        <InlineNotice
          tone="warning"
          message={
            staleData
              ? '没能刷新首页数据，下面显示的可能不是最新内容。'
              : '没能读取首页数据。'
          }
          actionLabel="重试"
          onActionPress={reload}
        />
      ) : null}

      <View style={styles.statRow}>
        <StatCard
          label="待使用次数"
          value={pendingText}
          unit="次"
          hint={statHint ?? '买过的次数减去已记录的次数'}
          accessibilityLabel={
            dashboard === null
              ? `待使用次数，${statHint ?? '暂无数据'}`
              : `待使用次数 ${dashboard.pendingCount} 次`
          }
        />
        <StatCard
          label="累计投入"
          value={spendText}
          hint={statHint ?? '全部套餐的总价合计'}
          accessibilityLabel={
            dashboard === null
              ? `累计投入，${statHint ?? '暂无数据'}`
              : `累计投入 ${spendText}`
          }
        />
      </View>

      <View style={styles.actions}>
        <Button label="添加套餐" icon="plus" variant="primary" onPress={openNewPurchase} />
        <Button label="记录一次" icon="check" onPress={openRedeemPicker} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="最近记录" />

        {firstLoad ? (
          <Text accessible style={styles.placeholder}>
            正在载入最近记录…
          </Text>
        ) : null}

        {recent.map((redemption) => (
          <RecentRedemptionCard
            key={redemption.id}
            redemption={redemption}
            onPress={openPurchase}
          />
        ))}

        {!firstLoad && !failedWithoutData && recent.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="还没有记录"
            description="完成第一次记录后，这里会显示最近做过的项目。"
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    gap: Layout.cardGap,
  },
  actions: {
    gap: Layout.cardGap,
  },
  section: {
    gap: Layout.cardGap,
  },
  placeholder: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
