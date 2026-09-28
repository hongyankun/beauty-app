import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';

/** 字段当前显示的人。`isArchived` 为 true 时它不在可选列表里，但照常显示、不被清空。 */
export type PersonPickerValue = {
  readonly id: string;
  readonly name: string;
  readonly isArchived: boolean;
};

/** 一个可选的人：只来自使用中的人。 */
export type PersonPickerOption = {
  readonly id: string;
  readonly name: string;
  readonly isSelf: boolean;
};

export type PersonPickerProps = {
  /** 可见标签，同时是读屏标签与弹层标题的一部分，例如「购买人」「使用人」 */
  label: string;
  /** null 只出现在可选人员还没读到时；读到后调用方应当填上默认的「自己」 */
  value: PersonPickerValue | null;
  /** 只含使用中的人，「自己」在最前 */
  options: readonly PersonPickerOption[];
  /** 只在「使用这个人」时调用；取消、点遮罩与系统返回都不会调用 */
  onChange: (value: PersonPickerValue) => void;
  disabled?: boolean;
  /** 校验失败原因。同时改描边颜色与显示文字，不只变红（PRD-NFR-005） */
  error?: string;
  helperText?: string;
};

function spokenName(value: PersonPickerValue): string {
  return value.isArchived ? `${value.name}（已归档）` : value.name;
}

/**
 * 选择一个人：整块可点，打开单级列表弹层。
 *
 * 受控组件，永远必填：
 * - 列表只有使用中的人（由调用方传入），「自己」在最前并带「固定」说明。
 * - 当前值是已归档的人时，它仍显示在字段里并以文字标注「已归档」，也作为列表第一行
 *   出现，方便原样保留；组件不会因为它不在可选列表里而清空或替换它。
 * - 打开时把当前值复制成草稿，点选只改草稿；只有「使用这个人」才调用 `onChange`。
 *   「取消选择」、点遮罩与系统返回都不改值。连点确认只写回一次。
 *
 * 不做搜索（与省市选择器同一理由：没有可复用的搜索输入组件）。
 * 本组件只负责选择，不读写数据库、不含路由。
 */
export function PersonPicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  error,
  helperText,
}: PersonPickerProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const confirmedRef = useRef(false);

  const blocked = disabled || value === null;

  function openPicker() {
    if (disabled || value === null) {
      return;
    }
    confirmedRef.current = false;
    setDraftId(value.id);
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setDraftId(null);
  }

  // 当前值不在可选列表里（已归档，或页面停留期间被归档）时，把它放在第一行。
  const keepCurrent =
    value !== null && !options.some((option) => option.id === value.id) ? value : null;

  function resolveDraft(): PersonPickerValue | null {
    if (draftId === null) {
      return null;
    }
    if (keepCurrent !== null && keepCurrent.id === draftId) {
      return keepCurrent;
    }
    const option = options.find((candidate) => candidate.id === draftId);
    return option === undefined ? null : { id: option.id, name: option.name, isArchived: false };
  }

  const pending = resolveDraft();

  function confirm() {
    if (pending === null || confirmedRef.current) {
      return;
    }
    confirmedRef.current = true;
    setOpen(false);
    setDraftId(null);
    onChange(pending);
  }

  const displayText = value === null ? '正在读取…' : spokenName(value);
  const borderColor = error ? Colors.coral : open ? Colors.mintStrong : Colors.borderLight;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.requirement}>（必填）</Text>
      </Text>

      <Pressable
        onPress={openPicker}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={`${label}，必填，${displayText}`}
        accessibilityHint={`双击选择${label}`}
        accessibilityState={{ disabled: blocked, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor },
          pressed && !blocked ? styles.triggerPressed : null,
          blocked ? styles.triggerDisabled : null,
        ]}>
        <Text style={[styles.value, value === null ? styles.placeholder : null]}>{displayText}</Text>
        <Icon name="chevronRight" size={20} color={Colors.textSecondary} />
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {helperText ? <Text style={styles.hint}>{helperText}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={cancel}>
        <View
          style={[
            styles.root,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
          ]}>
          {/* 点遮罩等同取消，不改值；读屏用户用「取消选择」按钮完成同一件事。 */}
          <Pressable
            style={[StyleSheet.absoluteFill, styles.scrim]}
            onPress={cancel}
            accessible={false}
            importantForAccessibility="no"
          />

          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.heading}>
              <Text style={styles.title} accessibilityRole="header">
                {`选择${label}`}
              </Text>
              <Text style={styles.subtitle}>
                新增或归档使用人，请到「我的 › 使用人管理」。
              </Text>
            </View>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
              {keepCurrent !== null ? (
                <OptionRow
                  label={spokenName(keepCurrent)}
                  selected={draftId === keepCurrent.id}
                  hint="已归档，只能保留原值，不能重新选择"
                  onPress={() => setDraftId(keepCurrent.id)}
                />
              ) : null}
              {options.map((option) => (
                <OptionRow
                  key={option.id}
                  label={option.name}
                  tag={option.isSelf ? '固定' : undefined}
                  selected={draftId === option.id}
                  onPress={() => setDraftId(option.id)}
                />
              ))}
            </ScrollView>

            {/* 弹层压在表单之上，表单底部已有一个实心主按钮，这里不再放第二个。 */}
            <View style={styles.actions}>
              <Button
                label="使用这个人"
                variant="secondary"
                onPress={confirm}
                disabled={pending === null}
                disabledReason={pending === null ? `请选择${label}` : undefined}
                accessibilityLabel={
                  pending === null ? undefined : `使用${spokenName(pending)}作为${label}`
                }
              />
              <Button
                label="取消选择"
                variant="text"
                onPress={cancel}
                accessibilityLabel={`取消选择，${label}保持不变`}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type OptionRowProps = {
  label: string;
  selected: boolean;
  tag?: string;
  hint?: string;
  onPress: () => void;
};

/** 一行选项：选中时浅底 + 描边 + 勾选图标 +「已选」文字，不只靠颜色（PRD-NFR-005）。 */
function OptionRow({ label, selected, tag, hint, onPress }: OptionRowProps) {
  const spoken = [label, tag === undefined ? null : `${tag}使用人`, selected ? '已选择' : null]
    .filter((part): part is string => part !== null)
    .join('，');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed && !selected ? styles.optionPressed : null,
      ]}>
      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>{label}</Text>
      {tag !== undefined ? <Text style={styles.optionTag}>{tag}</Text> : null}
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
  field: {
    gap: Layout.labelGap,
  },
  label: {
    ...TextStyles.label,
    color: Colors.textPrimary,
  },
  requirement: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  trigger: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  triggerPressed: {
    borderColor: Colors.mintStrong,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  value: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: Colors.textSecondary,
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
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
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: Colors.mintLight,
    borderColor: Colors.mintStrong,
  },
  optionPressed: {
    backgroundColor: Colors.mintLight,
  },
  optionLabel: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  optionLabelSelected: {
    ...TextStyles.bodyStrong,
  },
  optionTag: {
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
