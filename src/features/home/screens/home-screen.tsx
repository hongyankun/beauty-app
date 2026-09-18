import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, InlineNotice, Screen, SectionHeader, StatCard } from '@/components/ui';
import { Colors, Layout, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import { ExpiringPurchaseCard } from '../components/expiring-purchase-card';
import { RecentRedemptionCard } from '../components/recent-redemption-card';
import { useExpiringPurchases } from '../hooks/use-expiring-purchases';
import { useHomeDashboard } from '../hooks/use-home-dashboard';
import { EXPIRING_WINDOW_DAYS, HOME_REMINDER_LIMIT } from '../services/list-expiring-purchases';

/** 数字还没读到时的占位。只在首次加载与「一次都没读成功」时出现。 */
const NO_VALUE = '—';

/**
 * 首页总览。
 *
 * 回答三个问题：还剩多少次没用、一共花了多少钱、哪些套餐快到期了；
 * 再加上最近做过什么（PRD 第 8 章、IA 第 3.1.1 节）。图表与月度趋势不在范围内。
 *
 * 数据每次页面获得焦点时重读，所以在别处新增套餐、改有效期、核销、撤销核销或
 * 删除套餐后回到首页，数字、临期提醒与最近记录都会跟着变
 * （PRD-HOME-004、PRD-RED-002）。
 *
 * 概览与临期提醒是两个独立的查询：临期没读完不会挡住整张首页
 * （任务书第十二节）。
 */
export function HomeScreen() {
  const router = useRouter();
  const { status, dashboard, reload } = useHomeDashboard();
  const expiring = useExpiringPurchases();

  const openNewPurchase = useCallback(() => {
    router.push('/purchase/new');
  }, [router]);

  const openRedeemPicker = useCallback(() => {
    router.push('/redeem');
  }, [router]);

  const openExpiring = useCallback(() => {
    router.push('/(tabs)/home/expiring');
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

  // 首页只放最紧急的几个：已过期在前，其后是最早到期的（任务书第七节）。
  const reminders = expiring.result?.all.slice(0, HOME_REMINDER_LIMIT) ?? [];
  const expiringFirstLoad = expiring.status === 'loading' && expiring.result === null;
  const expiringFailedWithoutData = expiring.status === 'error' && expiring.result === null;

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
        {/* 「查看全部」常驻：只有 1 条时它也在同一个位置，用户不用先数够三条
            才发现还有一个完整列表（任务书第七节）。 */}
        <SectionHeader title="临期提醒" actionLabel="查看全部" onActionPress={openExpiring} />

        {expiring.status === 'error' ? (
          <InlineNotice
            tone="warning"
            message={
              expiringFailedWithoutData
                ? '没能读取临期提醒。'
                : '没能刷新临期提醒，下面显示的可能不是最新内容。'
            }
            actionLabel="重试"
            onActionPress={expiring.reload}
          />
        ) : null}

        {expiringFirstLoad ? (
          <Text accessible style={styles.placeholder}>
            正在读取临期提醒…
          </Text>
        ) : null}

        {reminders.map((purchase) => (
          <ExpiringPurchaseCard key={purchase.id} purchase={purchase} onPress={openPurchase} />
        ))}

        {/* 没有需要提醒的套餐是常态，不占一整块空状态卡，一行说明就够
            （任务书第七节）。 */}
        {!expiringFirstLoad && !expiringFailedWithoutData && reminders.length === 0 ? (
          <Text accessible style={styles.placeholder}>
            未来 {EXPIRING_WINDOW_DAYS} 天没有需要提醒的套餐
          </Text>
        ) : null}
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
