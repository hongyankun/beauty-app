import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, TextField } from '@/components/ui';
import { findServiceByCode } from '@/data/service-catalog';
import { Colors, Layout, Spacing, TextStyles } from '@/theme';
import { parseYuanToMinor } from '@/utils/money';
import { parseQuantity } from '@/utils/quantity';
import {
  quantityFloorMessage,
  type PurchaseItemDraft,
  type PurchaseItemErrors,
} from '../purchase-draft';
import { formatAveragePerUse } from '../services/purchase-allocation';
import type { PurchaseItemIdentity } from '../services/purchase-item-columns';
import { ServicePickerField } from './service-picker-field';

/** 编辑既有项目时的附加事实。新增流程不传。 */
export type PurchaseItemEditorContext = {
  /** 已核销次数，只统计有效核销 */
  readonly redeemedCount: number;
  /** 最小可填次数；历史超用的项目为它现在的次数，否则等于 `redeemedCount` */
  readonly minQuantity: number;
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
 * 一张卡片承载一个项目（UI_REFERENCE 第 8.1 章）。「做了什么项目」用两级项目选择器
 * （分类 → 目录项目或自定义，BT-0021B）；项目名称是单独的显示名称，选定项目时自动填入
 * 默认名称，之后可以改，改名不改变选中的项目。
 *
 * 有 `context` 时会在购买次数上方陈述已核销次数（IA 第 3.6.2 节：编辑态展示
 * 每个项目的已核销次数）。这里只陈述事实，不代替校验——能不能保存由
 * `validatePurchaseDraft` 与保存事务判定。
 *
 * 金额录入的是**分配到这个项目的总金额**（PRD 第 5B.6 节）。次数与金额都能解析时，
 * 下方陈述派生的单次均价，除不尽时标「约」；它只是展示，不写回任何地方。
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
        : quantityFloorMessage(context);

  // 新增的自定义项目名称就是自定义名称（DATA_MODEL_V4 第 4.4 节），只在「项目」里改；
  // 已有项目的名称可以单独修改，自定义名称原样保留。
  const nameFollowsCustomName = item.purchaseItemId === null && item.service?.serviceCode === null;

  const quantity = parseQuantity(item.quantity);
  const amount = parseYuanToMinor(item.allocatedAmount);
  const averageText =
    quantity.ok && amount.ok
      ? `单次均价 ${formatAveragePerUse(amount.minor, quantity.quantity)}`
      : null;

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

      <ServicePickerField
        label="项目"
        value={item.service}
        itemName={item.name}
        onChange={(service) => onChange(item.key, { service, name: defaultNameOf(service) })}
        error={errors?.service}
      />

      <TextField
        label="项目名称"
        required
        value={item.name}
        onChangeText={(value) => onChange(item.key, { name: value })}
        placeholder="选择项目后自动填入"
        editable={!nameFollowsCustomName}
        hint={
          nameFollowsCustomName
            ? '新增的自定义项目，名称与自定义名称一致；要改名请在上面的「项目」中修改'
            : '套餐里显示的名称，可以修改；改名不会改变上面选中的项目'
        }
        error={errors?.name}
      />

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

      <View style={styles.amountGroup}>
        <TextField
          label="项目分配金额"
          required
          value={item.allocatedAmount}
          onChangeText={(value) => onChange(item.key, { allocatedAmount: value })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          hint="单位为元，填写这个项目分到的总金额。赠送项目填 0"
          error={errors?.allocatedAmount}
        />
        {averageText === null ? null : <Text style={styles.average}>{averageText}</Text>}
      </View>

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

/** 重新选定项目时的默认名称：目录项目取目录名称，自定义项目取填写的名称。 */
function defaultNameOf(service: PurchaseItemIdentity): string {
  return service.serviceCode === null
    ? (service.customName ?? '')
    : (findServiceByCode(service.serviceCode)?.displayName ?? '');
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
  amountGroup: {
    gap: Layout.labelGap,
  },
  average: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
