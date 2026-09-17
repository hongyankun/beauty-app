import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Chip, ChipRow, Icon, TextField } from '@/components/ui';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { PURCHASE_ITEM_CATEGORY_OPTIONS } from '../categories';
import type { PurchaseItemDraft, PurchaseItemErrors } from '../purchase-draft';

/** 编辑既有项目时的附加事实。新增流程不传。 */
export type PurchaseItemEditorContext = {
  /** 已核销次数，只统计有效核销 */
  readonly redeemedCount: number;
  /** 是否有过任何核销记录，含已撤销 */
  readonly hasRedemptionHistory: boolean;
};

export type PurchaseItemEditorProps = {
  item: PurchaseItemDraft;
  /** 从 1 开始的序号，只用于标题与读屏，不入库 */
  position: number;
  errors?: PurchaseItemErrors;
  /** 编辑既有项目时的核销事实；不传表示这是一行新项目 */
  context?: PurchaseItemEditorContext;
  onChange: (key: string, patch: Partial<PurchaseItemDraft>) => void;
  onRemove: (key: string) => void;
  /** 只剩一个项目时不允许删除：套餐至少要有一个项目（PRD-PUR-003） */
  removable: boolean;
};

/**
 * 单个套餐项目的编辑卡片。
 *
 * 一张卡片承载一个项目（UI_REFERENCE 第 8.1 章）。分类用 Chip 组而不是下拉菜单：
 * 只有七个固定取值，平铺可以一眼看全，也不需要再引入弹层组件。
 *
 * 有 `context` 时会在购买次数上方陈述已核销次数（IA 第 3.6.2 节：编辑态展示
 * 每个项目的已核销次数）。这里只陈述事实，不代替校验——能不能保存由
 * `validatePurchaseDraft` 与保存事务判定。
 */
export function PurchaseItemEditor({
  item,
  position,
  errors,
  context,
  onChange,
  onRemove,
  removable,
}: PurchaseItemEditorProps) {
  const quantityHint =
    context === undefined
      ? undefined
      : context.redeemedCount === 0
        ? '还没有核销过'
        : `已核销 ${context.redeemedCount} 次，不能少于 ${context.redeemedCount}`;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>项目 {position}</Text>
        {removable ? (
          <Pressable
            onPress={() => onRemove(item.key)}
            accessibilityRole="button"
            accessibilityLabel={`从套餐中删除项目 ${position}`}
            hitSlop={Layout.labelGap}
            style={({ pressed }) => [styles.remove, pressed ? styles.pressed : null]}
          >
            <Icon name="trash" size={20} color={Colors.coral} />
            <Text style={styles.removeLabel}>删除</Text>
          </Pressable>
        ) : null}
      </View>

      <TextField
        label="项目名称"
        required
        value={item.name}
        onChangeText={(value) => onChange(item.key, { name: value })}
        placeholder="例如 超声炮、水光针"
        error={errors?.name}
      />

      <View style={styles.categoryGroup}>
        <Text style={styles.categoryLabel}>
          项目分类<Text style={styles.requirement}>（必填）</Text>
        </Text>
        <ChipRow accessibilityLabel={`项目 ${position} 的分类`}>
          {PURCHASE_ITEM_CATEGORY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={item.category === option.value}
              onPress={() => onChange(item.key, { category: option.value })}
            />
          ))}
        </ChipRow>
        {errors?.category ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errors.category}
          </Text>
        ) : null}
      </View>

      <TextField
        label="购买次数"
        required
        value={item.quantity}
        onChangeText={(value) => onChange(item.key, { quantity: value })}
        placeholder="例如 5"
        keyboardType="number-pad"
        hint={quantityHint}
        error={errors?.quantity}
      />

      <TextField
        label="单次金额"
        required
        value={item.unitAmount}
        onChangeText={(value) => onChange(item.key, { unitAmount: value })}
        placeholder="0.00"
        keyboardType="decimal-pad"
        hint="单位为元。赠送项目填 0"
        error={errors?.unitAmount}
      />

      <TextField
        label="项目备注"
        value={item.notes}
        onChangeText={(value) => onChange(item.key, { notes: value })}
        placeholder="例如 含术后修复面膜"
        multiline
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Layout.fieldGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.tightGap,
    minHeight: Layout.minTouchSize,
    paddingHorizontal: Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  removeLabel: {
    ...TextStyles.label,
    color: Colors.coral,
  },
  categoryGroup: {
    gap: Layout.labelGap,
  },
  categoryLabel: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  requirement: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
});
