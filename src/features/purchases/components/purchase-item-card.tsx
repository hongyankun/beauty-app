import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { formatMinorAsYuan } from '@/utils/money';
import { PURCHASE_ITEM_CATEGORY_LABELS } from '../categories';
import type { PurchaseDetailItem } from '../services/get-purchase-detail';

export type PurchaseItemCardProps = {
  item: PurchaseDetailItem;
  onRedeem: (purchaseItemId: string) => void;
};

/**
 * 套餐详情里的单个项目卡片。
 *
 * 次数是这张卡片的主角：买了几次、做了几次、还剩几次三个数字并排，
 * 用户扫一眼就能判断还要不要约（UI_REFERENCE 第 13 章）。
 *
 * 余次为 0 时「核销一次」置为不可用，并**用文字说明原因**，
 * 不只把按钮变灰（UI_REFERENCE 第 10 章、E-05、PRD-RED-004）。
 * 这只是提前告知，真正保证不会超额的是核销事务本身。
 */
export function PurchaseItemCard({ item, onRedeem }: PurchaseItemCardProps) {
  const usedUp = item.remaining === 0;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.categoryTag}>
          <Text style={styles.categoryLabel}>{PURCHASE_ITEM_CATEGORY_LABELS[item.category]}</Text>
        </View>
      </View>

      <View style={styles.counts}>
        <Count label="购买" value={`${item.quantity} 次`} />
        <Count label="已核销" value={`${item.redeemedCount} 次`} />
        <Count label="剩余" value={`${item.remaining} 次`} emphasized={!usedUp} />
      </View>

      <Text style={styles.meta}>单次金额 {formatMinorAsYuan(item.unitAmountMinor)}</Text>
      {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

      <Button
        label="核销一次"
        icon="check"
        disabled={usedUp}
        disabledReason={usedUp ? '已无剩余次数' : undefined}
        onPress={() => onRedeem(item.id)}
        accessibilityLabel={
          usedUp
            ? `${item.name}，已无剩余次数，无法核销`
            : `核销一次 ${item.name}，剩余 ${item.remaining} 次`
        }
      />
    </Card>
  );
}

function Count({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countValue, emphasized ? styles.countValueEmphasized : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Layout.cardGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  name: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
    flex: 1,
  },
  categoryTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.tag,
    backgroundColor: Colors.backgroundWarm,
  },
  categoryLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  counts: {
    flexDirection: 'row',
    gap: Spacing.xxl,
  },
  count: {
    gap: Layout.tightGap,
  },
  countLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  countValue: {
    ...TextStyles.bodyStrong,
    color: Colors.textSecondary,
  },
  countValueEmphasized: {
    color: Colors.textPrimary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  notes: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
