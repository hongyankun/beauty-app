import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, TextField } from '@/components/ui';
import {
  cleanServiceName,
  customServiceSelection,
  findServiceByCode,
  getServiceCategoryDisplayName,
  isServiceCategoryCode,
  isValidNewServiceSelection,
  listActiveServices,
  listServiceCategories,
  searchServices,
  standardServiceSelection,
} from '@/data/service-catalog';
import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';
import {
  describeItemIdentity,
  isSameIdentity,
  type PurchaseItemIdentity,
} from '../services/purchase-item-columns';

export type ServicePickerFieldProps = {
  /** 可见标签，同时是读屏标签与弹层标题的一部分 */
  label: string;
  /** null 表示还没选。库里的旧值（目录不认识、已停用）照常传进来，只显示、不改写 */
  value: PurchaseItemIdentity | null;
  /** 套餐项目当前的名称；目录不认识的旧代码按它显示 */
  itemName: string;
  /** 只在确认了一个**不同的**新选择时调用；取消、点遮罩、系统返回与原样确认都不会调用 */
  onChange: (value: PurchaseItemIdentity) => void;
  disabled?: boolean;
  /** 校验失败原因。同时改描边颜色与显示文字，不只变红（PRD-NFR-005） */
  error?: string;
};

type Step = 'category' | 'service';

/** 第二步选中的是哪一项：某个目录项目，或「自定义项目」 */
type Choice = { readonly type: 'standard'; readonly code: string } | { readonly type: 'custom' } | null;

type Draft = {
  readonly step: Step;
  readonly categoryCode: string | null;
  readonly choice: Choice;
  /** 「自定义项目」时填写的名称 */
  readonly customText: string;
  /** 第一步的搜索词，只在弹层内有效，不保存 */
  readonly query: string;
};

const EMPTY_DRAFT: Draft = { step: 'category', categoryCode: null, choice: null, customText: '', query: '' };

/** 「其他」没有目录项目，只能自定义。 */
function hasCatalogServices(categoryCode: string): boolean {
  return listActiveServices(categoryCode).length > 0;
}

/**
 * 打开弹层时把当前值复制成草稿。
 *
 * 当前值是一个合法的新选择时，直接停在第二步并选中它；自定义项目带回原名称。
 * 旧值（已停用、目录不认识、分类与代码对不上）不会被当作草稿里的选中项：
 * 分类认得就停在该分类的第二步、什么都不选，否则从第一步重新选。不猜一个最接近的。
 */
function draftFromValue(value: PurchaseItemIdentity | null): Draft {
  if (value === null || !isServiceCategoryCode(value.categoryCode)) {
    return EMPTY_DRAFT;
  }
  const base: Draft = { ...EMPTY_DRAFT, step: 'service', categoryCode: value.categoryCode };
  if (!isValidNewServiceSelection(value)) {
    return hasCatalogServices(value.categoryCode) ? base : { ...base, choice: { type: 'custom' } };
  }
  return value.serviceCode !== null
    ? { ...base, choice: { type: 'standard', code: value.serviceCode } }
    : { ...base, choice: { type: 'custom' }, customText: value.customName ?? '' };
}

/** 草稿能否构成一个完整结果。结果只由目录 helpers 构造，界面上拼不出非法组合。 */
function selectionFromDraft(draft: Draft): PurchaseItemIdentity | null {
  if (draft.step !== 'service' || draft.categoryCode === null || draft.choice === null) {
    return null;
  }
  return draft.choice.type === 'standard'
    ? standardServiceSelection(draft.categoryCode, draft.choice.code)
    : customServiceSelection(draft.categoryCode, draft.customText);
}

function confirmDisabledReason(draft: Draft): string | undefined {
  if (draft.step === 'category') {
    return '请先选择项目分类，或搜索项目';
  }
  if (draft.choice === null) {
    return '请选择项目，或选择「自定义项目」后填写名称';
  }
  if (draft.choice.type === 'custom' && cleanServiceName(draft.customText) === '') {
    return '请填写项目名称，不能只有空格';
  }
  return undefined;
}

function nameOf(selection: PurchaseItemIdentity): string {
  return selection.serviceCode === null
    ? (selection.customName ?? '')
    : (findServiceByCode(selection.serviceCode)?.displayName ?? '');
}

/**
 * 项目选择字段：整块可点，打开两级选择弹层——项目分类 → 项目（BT-0021B）。
 *
 * 受控组件，只产出两种结果：目录项目（分类 + 代码）或自定义项目（分类 + 名称）。
 * - 第一步列出七个分类，上方可以按名称或别名搜索在用项目。搜索结果只是候选：
 *   点一条只把它放进草稿，仍要「使用这个项目」才写回，不会因为命中别名就替用户选中。
 * - 第二步列出该分类下的在用项目与「自定义项目」；「其他」只有自定义。
 *   已停用的项目不出现。换分类会丢掉之前选的项目。
 * - 自定义名称与某个目录项目同名也仍是自定义项目，不自动归并（PRD 第 5B.10 节）。
 * - 打开时把 `value` 复制成草稿，所有点选只改草稿；「取消选择」、点遮罩与系统返回都不改值。
 *   确认的结果与当前值完全相同时同样不调用 `onChange`，旧值因此不会被改写。
 *
 * 本组件只负责选择，不读写数据库、不含路由；写入前的严格校验由 service 在事务内完成。
 */
export function ServicePickerField({
  label,
  value,
  itemName,
  onChange,
  disabled = false,
  error,
}: ServicePickerFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // 连点「使用这个项目」时，第二次点击可能在弹层关闭、重新渲染之前到达；
  // 用 ref 而不是 state 挡住，保证一次打开最多调用一次 onChange。
  const confirmedRef = useRef(false);

  function openPicker() {
    if (disabled) {
      return;
    }
    confirmedRef.current = false;
    setDraft(draftFromValue(value));
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  const pending = selectionFromDraft(draft);
  const disabledReason = pending === null ? confirmDisabledReason(draft) : undefined;

  function confirm() {
    if (pending === null || confirmedRef.current) {
      return;
    }
    confirmedRef.current = true;
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    if (value === null || !isSameIdentity(value, pending)) {
      onChange(pending);
    }
  }

  function selectCategory(categoryCode: string) {
    setDraft((current) => {
      const same = current.categoryCode === categoryCode;
      return {
        ...current,
        step: 'service',
        categoryCode,
        // 换了分类就丢掉之前的项目：旧代码不属于新分类。「其他」直接进入自定义。
        choice: same && current.choice !== null
          ? current.choice
          : hasCatalogServices(categoryCode)
            ? null
            : { type: 'custom' },
        customText: same ? current.customText : '',
        query: '',
      };
    });
    AccessibilityInfo.announceForAccessibility(
      `已进入${getServiceCategoryDisplayName(categoryCode)}的项目列表`,
    );
  }

  function selectSearchResult(categoryCode: string, serviceCode: string) {
    setDraft((current) => ({
      ...current,
      step: 'service',
      categoryCode,
      choice: { type: 'standard', code: serviceCode },
      customText: '',
      query: '',
    }));
    AccessibilityInfo.announceForAccessibility('已放入候选，确认后才会使用这个项目');
  }

  function backToCategories() {
    setDraft((current) => ({ ...current, step: 'category' }));
    AccessibilityInfo.announceForAccessibility('已返回项目分类列表');
  }

  const display = value === null ? null : describeItemIdentity(value, itemName);
  const displayText =
    display === null
      ? '请选择项目'
      : `${display.categoryLabel} · ${display.serviceLabel}${display.kind === 'custom' ? '（自定义）' : ''}`;
  const spokenValue =
    display === null ? '未选择' : display.note === null ? displayText : `${displayText}，${display.note}`;
  const borderColor = error ? Colors.coral : open ? Colors.mintStrong : Colors.borderLight;

  const results = draft.step === 'category' ? searchServices(draft.query) : [];
  const searching = draft.step === 'category' && cleanServiceName(draft.query) !== '';
  const stepTitle =
    draft.step === 'category'
      ? '第 1 步：选择项目分类'
      : `第 2 步：选择项目 · ${getServiceCategoryDisplayName(draft.categoryCode ?? '')}`;
  const pendingText = pending === null ? null : nameOf(pending);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.requirement}>（必填）</Text>
      </Text>

      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}，必填，${spokenValue}`}
        accessibilityHint="双击选择项目分类和项目"
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor },
          pressed && !disabled ? styles.triggerPressed : null,
          disabled ? styles.triggerDisabled : null,
        ]}>
        <Text style={[styles.value, display === null ? styles.placeholder : null]}>{displayText}</Text>
        <Icon name="chevronRight" size={20} color={Colors.textSecondary} />
      </Pressable>

      {display?.note ? (
        <Text style={styles.hint} importantForAccessibility="no">
          {`${display.note}。不重新选择就会原样保留`}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={cancel}>
        <KeyboardAvoidingView
          style={[
            styles.root,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg },
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
              <Text style={styles.stepTitle}>{stepTitle}</Text>
              {draft.step === 'category' ? (
                <TextField
                  label="搜索项目"
                  value={draft.query}
                  onChangeText={(text) => setDraft((current) => ({ ...current, query: text }))}
                  placeholder="输入项目名称或常见叫法"
                  maxLength={50}
                />
              ) : (
                <View style={styles.backRow}>
                  <Button
                    label="返回分类列表"
                    variant="text"
                    icon="chevronLeft"
                    onPress={backToCategories}
                    accessibilityLabel="返回项目分类列表，重新选择分类"
                  />
                </View>
              )}
            </View>

            {/* 项目最多几十行，大字体下必然超过一屏，列表交给 ScrollView；
                填写框与按钮放在滚动区外，键盘弹出时仍在键盘上方。 */}
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator>
              {draft.step === 'category' && searching ? (
                results.length === 0 ? (
                  <Text style={styles.explain}>
                    没有找到匹配的项目。可以选择分类后用「自定义项目」填写名称。
                  </Text>
                ) : (
                  results.map((result) => (
                    <OptionRow
                      key={result.entry.code}
                      label={result.entry.displayName}
                      detail={
                        result.matchedAlias === null
                          ? getServiceCategoryDisplayName(result.entry.categoryCode)
                          : `${getServiceCategoryDisplayName(result.entry.categoryCode)} · 常见叫法「${result.matchedAlias}」`
                      }
                      selected={false}
                      hint="放入候选，确认后才会使用"
                      onPress={() => selectSearchResult(result.entry.categoryCode, result.entry.code)}
                    />
                  ))
                )
              ) : null}

              {draft.step === 'category' && !searching
                ? listServiceCategories().map((category) => (
                    <OptionRow
                      key={category.code}
                      label={category.displayName}
                      selected={draft.categoryCode === category.code}
                      hint={
                        category.hasCatalogServices
                          ? '进入下一步选择项目'
                          : '进入下一步，这个分类没有目录项目，需要填写项目名称'
                      }
                      showChevron
                      onPress={() => selectCategory(category.code)}
                    />
                  ))
                : null}

              {draft.step === 'service' && draft.categoryCode !== null ? (
                <>
                  {listActiveServices(draft.categoryCode).map((entry) => (
                    <OptionRow
                      key={entry.code}
                      label={entry.displayName}
                      selected={draft.choice?.type === 'standard' && draft.choice.code === entry.code}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          choice: { type: 'standard', code: entry.code },
                          customText: '',
                        }))
                      }
                    />
                  ))}
                  <OptionRow
                    label="自定义项目"
                    selected={draft.choice?.type === 'custom'}
                    hint="目录中找不到时选择，需要填写项目名称"
                    onPress={() => setDraft((current) => ({ ...current, choice: { type: 'custom' } }))}
                  />
                </>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {draft.step === 'service' && draft.choice?.type === 'custom' ? (
                <TextField
                  label="项目名称"
                  required
                  value={draft.customText}
                  onChangeText={(text) => setDraft((current) => ({ ...current, customText: text }))}
                  hint="按你知道的名称填写，会作为自定义项目保存，不会被换成目录中的项目"
                  maxLength={50}
                />
              ) : null}

              {/* 弹层压在表单之上，表单底部已有一个实心主按钮，这里不再放第二个。 */}
              <View style={styles.actions}>
                <Button
                  label="使用这个项目"
                  variant="secondary"
                  onPress={confirm}
                  disabled={pending === null}
                  disabledReason={disabledReason}
                  accessibilityLabel={
                    pendingText === null ? undefined : `使用${pendingText}作为${label}`
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
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

type OptionRowProps = {
  label: string;
  /** 第二行说明，例如搜索结果所属的分类 */
  detail?: string;
  selected: boolean;
  hint?: string;
  /** 点击后进入下一级 */
  showChevron?: boolean;
  onPress: () => void;
};

/** 一行选项：选中时浅底 + 描边 + 勾选图标 +「已选」文字，不只靠颜色（PRD-NFR-005）。 */
function OptionRow({ label, detail, selected, hint, showChevron = false, onPress }: OptionRowProps) {
  const spoken = detail === undefined ? label : `${label}，${detail}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={selected ? `${spoken}，已选择` : spoken}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed && !selected ? styles.optionPressed : null,
      ]}>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>{label}</Text>
        {detail === undefined ? null : <Text style={styles.optionDetail}>{detail}</Text>}
      </View>
      {selected ? (
        <View style={styles.selectedMark}>
          <Icon name="check" size={18} color={Colors.mintStrong} />
          <Text style={styles.selectedText}>已选</Text>
        </View>
      ) : null}
      {showChevron ? <Icon name="chevronRight" size={18} color={Colors.textSecondary} /> : null}
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
  stepTitle: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  backRow: {
    alignItems: 'flex-start',
  },
  list: {
    gap: Layout.tightGap,
  },
  explain: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  footer: {
    gap: Layout.cardGap,
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
  optionText: {
    flex: 1,
    gap: Layout.tightGap,
  },
  optionLabel: {
    ...TextStyles.body,
    color: Colors.textPrimary,
  },
  optionLabelSelected: {
    ...TextStyles.bodyStrong,
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
