import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';

/** 弹层里的一行选项。 */
export type ChoiceOption = {
  readonly key: string;
  readonly title: string;
  /** 第二行说明，例如所属套餐、剩余次数与有效期 */
  readonly detail?: string;
  /** 短标签，例如「单次」；同时写进读屏标签 */
  readonly tag?: string;
};

export type ChoiceModalProps = {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly options: readonly ChoiceOption[];
  /** 打开时预先选中的一项；没有时为 null */
  readonly initialKey: string | null;
  readonly confirmLabel: string;
  /** 没有任何选项时的说明 */
  readonly emptyText: string;
  /** 进行中：确认按钮显示进行中文案并禁用，取消也禁用 */
  readonly confirming?: boolean;
  readonly confirmingLabel?: string;
  readonly error?: string | null;
  /** 列表下方的一个文字开关，例如「也显示单次购买」；不传则不显示 */
  readonly toggle?: { readonly label: string; readonly onPress: () => void };
  /** 只在点了确认按钮时调用，参数是草稿里选中的那一项 */
  readonly onConfirm: (key: string) => void;
  readonly onCancel: () => void;
};

/**
 * 单选弹层（BT-0023）。「使用已有套餐」选择购买项目、修正来源选择目标，共用这一份。
 *
 * 与人员、省市、项目选择器同一套规则：打开时把当前值复制成草稿，点选只改草稿；
 * 只有确认按钮才写回，取消、点遮罩与系统返回都不改值。选中状态同时用浅底、描边、
 * 勾选图标与「已选」文字表达，不只靠颜色（PRD-NFR-005）。
 * 弹层压在表单之上，表单底部已有实心主按钮，这里的确认用描边按钮。
 */
export function ChoiceModal({
  visible,
  title,
  subtitle,
  options,
  initialKey,
  confirmLabel,
  emptyText,
  confirming = false,
  confirmingLabel,
  error,
  toggle,
  onConfirm,
  onCancel,
}: ChoiceModalProps) {
  const insets = useSafeAreaInsets();
  const [draftKey, setDraftKey] = useState<string | null>(initialKey);
  const wasVisible = useRef(false);

  // 每次打开都从当前值重新开始，上一次未确认的点选不带进来。
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setDraftKey(initialKey);
    }
    wasVisible.current = visible;
  }, [visible, initialKey]);

  const selected = options.find((option) => option.key === draftKey) ?? null;

  function cancel() {
    if (!confirming) {
      onCancel();
    }
  }

  function confirm() {
    if (selected !== null && !confirming) {
      onConfirm(selected.key);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <View
        style={[styles.root, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={cancel}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
            {options.length === 0 ? <Text style={styles.subtitle}>{emptyText}</Text> : null}
            {options.map((option) => (
              <OptionRow
                key={option.key}
                option={option}
                selected={option.key === draftKey}
                disabled={confirming}
                onPress={() => setDraftKey(option.key)}
              />
            ))}
          </ScrollView>

          {toggle ? (
            <Button label={toggle.label} variant="text" onPress={toggle.onPress} disabled={confirming} />
          ) : null}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={confirming ? (confirmingLabel ?? confirmLabel) : confirmLabel}
              variant="secondary"
              loading={confirming}
              onPress={confirm}
              disabled={selected === null}
              disabledReason={selected === null ? '请先选择一项' : undefined}
              accessibilityLabel={selected === null ? undefined : `${confirmLabel}：${selected.title}`}
            />
            <Button
              label="取消"
              variant="text"
              onPress={cancel}
              disabled={confirming}
              accessibilityLabel="取消，保持不变"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: ChoiceOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const spoken = [option.title, option.tag ?? null, option.detail ?? null, selected ? '已选择' : null]
    .filter((part): part is string => part !== null)
    .join('，');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed && !selected ? styles.optionPressed : null,
      ]}
    >
      <View style={styles.optionText}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : null]}>{option.title}</Text>
          {option.tag ? <Text style={styles.optionTag}>{option.tag}</Text> : null}
        </View>
        {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
      </View>
      {selected ? (
        <View style={styles.selectedMark}>
          <Icon name="check" size={18} color={Colors.mintStrong} />
          <Text style={styles.selectedText}>已选</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.pageHorizontal,
  },
  scrim: {
    backgroundColor: Colors.textPrimary,
    opacity: 0.32,
  },
  dialog: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.sheet,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    padding: Layout.cardPadding,
    gap: Layout.cardGap,
    maxHeight: '100%',
    ...Shadows.overlay,
  },
  heading: {
    gap: Layout.tightGap,
  },
  title: {
    ...TextStyles.sectionTitle,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  list: {
    gap: Layout.tightGap,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
  actions: {
    gap: Layout.tightGap,
  },
  option: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.surface,
  },
  optionSelected: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintStrong,
  },
  optionPressed: {
    backgroundColor: Colors.mintLight,
  },
  optionText: {
    flex: 1,
    gap: Layout.tightGap,
  },
  optionTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Layout.tightGap,
  },
  optionTitle: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  optionTitleSelected: {
    ...TextStyles.bodyStrong,
  },
  optionTag: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  optionDetail: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  selectedMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.tightGap,
  },
  selectedText: {
    ...TextStyles.caption,
    color: Colors.mintStrong,
  },
});
