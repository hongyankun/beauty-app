import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, ChipRow, TextField } from '@/components/ui';
import { PersonPicker, type PersonPickerOption } from '@/features/people/components/person-picker';
import { ServicePickerField } from '@/features/purchases/components/service-picker-field';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import type { UsageLineDraft, UsageLineErrors, UsageSourceMode } from '../event-draft';

/** 五种可新建的来源（PRD 第 5B.3 节），产品语言，界面上不出现技术取值。 */
const SOURCE_OPTIONS: readonly { readonly mode: UsageSourceMode; readonly label: string; readonly hint: string }[] = [
  { mode: 'package', label: '使用已有套餐', hint: '从自己仍有剩余次数、且是同一个项目的套餐里扣这一次。' },
  { mode: 'new_package', label: '新建套餐并使用', hint: '当场新建一个套餐，并从中扣这一次；保存记录时才会真正新建。' },
  { mode: 'single', label: '本次单独购买', hint: '这一次单独付费：会同时记下一条「单次」购买。' },
  { mode: 'external', label: '外部来源', hint: '不是自己的资产，例如朋友请客、用了别人的卡、活动体验。' },
  { mode: 'unlinked', label: '暂不关联', hint: '先不关联任何来源，以后也可以不关联。' },
];

export type UsageLineCardProps = {
  readonly line: UsageLineDraft;
  /** 第几个项目，从 1 开始 */
  readonly index: number;
  readonly canRemove: boolean;
  readonly errors?: UsageLineErrors;
  readonly personOptions: readonly PersonPickerOption[];
  /** 与这一行项目匹配、仍有余次的已有套餐项目数，用于空状态 */
  readonly matchingCandidateCount: number;
  readonly disabled: boolean;
  readonly onChangeService: (service: PurchaseItemIdentity) => void;
  readonly onChangeSource: (mode: UsageSourceMode) => void;
  readonly onChange: (patch: Partial<UsageLineDraft>) => void;
  readonly onRemove: () => void;
  /** 打开「使用已有套餐」的选择弹层 */
  readonly onChooseCandidate: () => void;
  /** 打开「新建套餐并使用」子步骤（新建或修改） */
  readonly onOpenNewPackage: () => void;
  /** 新套餐里有多个匹配项目时，选择这次用的是哪一个 */
  readonly onChooseNewPackageItem: () => void;
};

/**
 * 「记录一次变美」中的一个项目（一条使用记录）。
 *
 * 顺序固定为「项目 → 使用人 → 来源 → 来源详情」（BT-0023B 裁决）：先回忆做了什么，再记谁做的，
 * 最后说明从哪里来。来源详情放在来源下方带左侧描边的区块里，视觉上隶属于来源。
 * 项目只在卡片顶部选一次，来源详情不再出现第二个项目选择器。
 * 保存后这些内容都不能直接修改（裁决 4），所以卡片底部写明纠错方式。
 */
export function UsageLineCard({
  line,
  index,
  canRemove,
  errors,
  personOptions,
  matchingCandidateCount,
  disabled,
  onChangeService,
  onChangeSource,
  onChange,
  onRemove,
  onChooseCandidate,
  onOpenNewPackage,
  onChooseNewPackageItem,
}: UsageLineCardProps) {
  const hasService = line.service !== null;
  const sourceHint = SOURCE_OPTIONS.find((option) => option.mode === line.mode)?.hint ?? null;
  const newPackageItem =
    line.newPackage?.draft.items.find((item) => item.key === line.newPackageItemKey) ?? null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          项目 {index}
        </Text>
        {canRemove ? (
          <Button
            label="移除"
            variant="text"
            onPress={onRemove}
            disabled={disabled}
            accessibilityLabel={`移除项目 ${index}`}
          />
        ) : null}
      </View>

      {/* 1. 项目 */}
      <ServicePickerField
        label="项目"
        value={line.service}
        itemName={line.serviceName}
        onChange={onChangeService}
        disabled={disabled}
        error={errors?.service}
      />

      {/* 2. 使用人 */}
      <PersonPicker
        label="使用人"
        value={line.person}
        options={personOptions}
        onChange={(value) => onChange({ person: value })}
        disabled={disabled}
        helperText="默认是自己。这个项目实际是谁做的"
      />

      {/* 3. 来源：项目没选时不能选择 */}
      <View style={styles.field}>
        <Text style={styles.label}>
          来源<Text style={styles.requirement}>（必填）</Text>
        </Text>
        <ChipRow accessibilityLabel={`项目 ${index} 的来源`}>
          {SOURCE_OPTIONS.map((option) => (
            <Chip
              key={option.mode}
              label={option.label}
              selected={line.mode === option.mode}
              onPress={disabled || !hasService ? undefined : () => onChangeSource(option.mode)}
            />
          ))}
        </ChipRow>
        {!hasService ? <Text style={styles.hint}>请先选择项目，再选择来源。</Text> : null}
        {hasService && sourceHint !== null ? <Text style={styles.hint}>{sourceHint}</Text> : null}
        {errors?.source ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errors.source}
          </Text>
        ) : null}
      </View>

      {/* 4. 来源详情 */}
      {hasService && line.mode === 'package' ? (
        <View style={styles.detail}>
          {matchingCandidateCount === 0 && line.candidate === null ? (
            <Text style={styles.hint}>
              没有与这个项目匹配且仍有余次的套餐项目。你可以改选项目，或选择其他来源。
            </Text>
          ) : (
            <Button
              label={line.candidate === null ? '选择要使用的套餐' : line.candidate.purchaseName}
              icon="records"
              onPress={onChooseCandidate}
              disabled={disabled}
              accessibilityLabel={
                line.candidate === null
                  ? `项目 ${index}，选择要使用的套餐`
                  : `项目 ${index}，已选择套餐 ${line.candidate.purchaseName}，剩余 ${line.candidate.remaining} 次，点按更换`
              }
            />
          )}
          {line.candidate !== null ? (
            <Text style={styles.hint}>
              剩余 {line.candidate.remaining} 次
              {line.candidate.purchaseKind === 'single' ? ' · 单次购买' : ''}
              {line.candidate.expiresOn === null ? '' : ` · 有效期至 ${line.candidate.expiresOn}`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hasService && line.mode === 'new_package' ? (
        <View style={styles.detail}>
          {line.newPackage === null ? (
            <Button
              label="新建套餐"
              icon="plus"
              onPress={onOpenNewPackage}
              disabled={disabled}
              accessibilityLabel={`项目 ${index}，新建一个套餐并从中使用这一次`}
            />
          ) : (
            <>
              <Text style={styles.value}>
                {line.newPackage.input.name} · {line.newPackage.input.items.length} 个项目
              </Text>
              {newPackageItem === null ? (
                <Text style={styles.error}>新套餐里没有与这个项目匹配的项目，请修改新套餐。</Text>
              ) : (
                <Text style={styles.hint}>这次从新套餐里的「{newPackageItem.name}」扣一次。</Text>
              )}
              {line.newPackage.draft.items.length > 1 && newPackageItem !== null ? (
                <Button
                  label="换一个新套餐里的项目"
                  variant="text"
                  onPress={onChooseNewPackageItem}
                  disabled={disabled}
                  accessibilityLabel={`项目 ${index}，选择这次用的是新套餐里的哪个相同项目`}
                />
              ) : null}
              <Button
                label="修改新套餐"
                variant="text"
                onPress={onOpenNewPackage}
                disabled={disabled}
                accessibilityLabel={`项目 ${index}，修改新建的套餐`}
              />
              <Text style={styles.hint}>保存这次记录时才会真正新建这个套餐。</Text>
            </>
          )}
        </View>
      ) : null}

      {hasService && line.mode === 'single' ? (
        <View style={styles.detail}>
          <TextField
            label="本次花费"
            required
            value={line.amount}
            onChangeText={(value) => onChange({ amount: value })}
            placeholder="0.00"
            keyboardType="decimal-pad"
            hint="单位为元。赠送、体验或本次未收费填 0"
            error={errors?.amount}
            editable={!disabled}
          />
          <PersonPicker
            label="购买人"
            value={line.purchaser}
            options={personOptions}
            onChange={(value) => onChange({ purchaser: value })}
            disabled={disabled}
            helperText="默认是自己。这一次是谁付的钱"
          />
        </View>
      ) : null}

      <TextField
        label="这个项目的备注"
        value={line.notes}
        onChangeText={(value) => onChange({ notes: value })}
        placeholder="例如 换了一位操作医生"
        multiline
        editable={!disabled}
      />

      <Text style={styles.hint}>
        保存后，使用人、项目和这条备注不能直接修改；记错了可以撤销这一条再重新记录。
      </Text>
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
  field: {
    gap: Layout.labelGap,
  },
  detail: {
    gap: Layout.labelGap,
    paddingLeft: Spacing.md,
    borderLeftWidth: BorderWidth.hairline,
    borderLeftColor: Colors.borderLight,
    borderRadius: Radii.input,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  requirement: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  value: {
    ...TextStyles.bodyStrong,
    color: Colors.textPrimary,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
});
