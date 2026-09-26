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

import {
  findProvinceByCode,
  formatProvinceCitySelection,
  isStandardPair,
  isValidProvinceCitySelection,
  listSelectableCities,
  listSelectableProvinces,
  normalizeCustomRegionText,
  otherRegionSelection,
  provinceCustomCitySelection,
  standardSelectionFromCity,
  type ProvinceCitySelection,
} from '@/data/administrative-divisions';
import { BorderWidth, Colors, Layout, Radii, Shadows, Spacing, TextStyles } from '@/theme';
import { Button } from './button';
import { Icon } from './icon';
import { TextField } from './text-field';

export type ProvinceCityFieldProps = {
  /** 可见标签，同时是读屏标签与弹层标题的一部分 */
  label: string;
  /** null 表示未选择 */
  value: ProvinceCitySelection | null;
  /** 只在最终确认或清除时调用；取消、点遮罩与系统返回都不会调用 */
  onChange: (value: ProvinceCitySelection | null) => void;
  required?: boolean;
  /** 选填且已有值时，在字段下方提供「清除地区」 */
  clearable?: boolean;
  disabled?: boolean;
  /** 校验失败原因。同时改描边颜色与显示文字，不只变红（PRD-NFR-005） */
  error?: string;
  helperText?: string;
  accessibilityHint?: string;
};

type Step = 'province' | 'city' | 'other';

/** 第一级选中的是哪一项：某个省级地区，或「其他地区」 */
type RegionChoice = { readonly type: 'province'; readonly code: string } | { readonly type: 'other' } | null;

/** 第二级选中的是哪一项：某个标准城市，或「暂未收录」 */
type CityChoice = { readonly type: 'standard'; readonly code: string } | { readonly type: 'unlisted' } | null;

type Draft = {
  readonly step: Step;
  readonly region: RegionChoice;
  readonly city: CityChoice;
  /** 「暂未收录」时填写的城市名称 */
  readonly cityText: string;
  /** 「其他地区」时填写的地区名称 */
  readonly otherText: string;
};

const EMPTY_DRAFT: Draft = { step: 'province', region: null, city: null, cityText: '', otherText: '' };

/**
 * 打开弹层时把当前值复制成草稿：已有值时直接停在它所在的那一级。
 * 当前值通不过校验（例如代码伪造、名称与目录对不上）时从第一级重新选，不猜一个最接近的。
 */
function draftFromValue(value: ProvinceCitySelection | null): Draft {
  if (value === null || !isValidProvinceCitySelection(value)) {
    return EMPTY_DRAFT;
  }
  switch (value.kind) {
    case 'standard':
      return {
        ...EMPTY_DRAFT,
        step: 'city',
        region: { type: 'province', code: value.provinceCode },
        city: { type: 'standard', code: value.cityCode },
      };
    case 'province_custom_city':
      return {
        ...EMPTY_DRAFT,
        step: 'city',
        region: { type: 'province', code: value.provinceCode },
        city: { type: 'unlisted' },
        cityText: value.city,
      };
    case 'other_region':
      return { ...EMPTY_DRAFT, step: 'other', region: { type: 'other' }, otherText: value.city };
    default:
      return EMPTY_DRAFT;
  }
}

/** 草稿能否构成一个完整结果。结果只由目录与 helpers 构造，界面上拼不出非法组合。 */
function selectionFromDraft(draft: Draft): ProvinceCitySelection | null {
  if (draft.step === 'other') {
    return otherRegionSelection(draft.otherText);
  }
  if (draft.step !== 'city' || draft.region?.type !== 'province' || draft.city === null) {
    return null;
  }
  if (draft.city.type === 'unlisted') {
    return provinceCustomCitySelection(draft.region.code, draft.cityText);
  }
  return isStandardPair(draft.region.code, draft.city.code)
    ? standardSelectionFromCity(draft.city.code)
    : null;
}

function confirmDisabledReason(draft: Draft): string | undefined {
  switch (draft.step) {
    case 'province':
      return '请先选择省级地区，或选择「其他地区」';
    case 'other':
      return normalizeCustomRegionText(draft.otherText) === null ? '请填写地区名称，不能只有空格' : undefined;
    case 'city':
      if (draft.city === null) {
        return '请选择城市，或选择「暂未收录」后填写';
      }
      if (draft.city.type === 'unlisted' && normalizeCustomRegionText(draft.cityText) === null) {
        return '请填写城市名称，不能只有空格';
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * 省市选择字段：整块可点，打开两级选择弹层——省级地区 → 城市。
 *
 * 受控组件，只产出三种结果（见 `ProvinceCitySelection`）或 null：
 * - 第一级列出全部省级地区与「其他地区」；点省份进入第二级，点「其他地区」填写地区名称。
 * - 第二级列出该省的标准城市与固定的「暂未收录」；选「暂未收录」需填写城市名称。
 *   台湾省、香港、澳门在目录中没有地级数据，第二级只有「暂未收录」。
 * - 打开时把 `value` 复制成草稿，所有点选只改草稿；只有「使用这个地区」才调用 `onChange`。
 *   「取消选择」、点遮罩与系统返回都不改值。换省份会丢掉之前选的城市。
 *
 * 不做搜索：共享的 `SearchField` 只是点击跳转的占位件，不能输入；
 * 按任务约定，没有可复用的搜索组件时不另写一个。
 *
 * 本组件只负责选择，不读写数据库、不含路由，也不决定结果写到哪张表。
 */
export function ProvinceCityField({
  label,
  value,
  onChange,
  required = false,
  clearable = false,
  disabled = false,
  error,
  helperText,
  accessibilityHint = '双击选择省份和城市',
}: ProvinceCityFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // 连点「使用这个地区」时，第二次点击可能在弹层关闭、重新渲染之前到达；
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
    onChange(pending);
  }

  function selectProvince(code: string) {
    const province = findProvinceByCode(code);
    if (province === null) {
      return;
    }
    setDraft((current) => {
      const sameProvince = current.region?.type === 'province' && current.region.code === code;
      return {
        ...current,
        step: 'city',
        region: { type: 'province', code },
        // 换了省份就丢掉之前的城市：旧城市代码不属于新省份。
        city: sameProvince
          ? current.city
          : province.cityCoverage === 'unlisted_only'
            ? { type: 'unlisted' }
            : null,
        cityText: sameProvince ? current.cityText : '',
        // 「其他地区」的文字只属于「其他地区」，进了省份就不再保留。
        otherText: '',
      };
    });
    AccessibilityInfo.announceForAccessibility(`已进入${province.displayName}的城市列表`);
  }

  function selectOther() {
    setDraft((current) => ({
      ...current,
      step: 'other',
      region: { type: 'other' },
      city: null,
      cityText: '',
      // 从「其他地区」返回省级列表、没选省份又点回来时，保留刚才填写的文字。
      otherText: current.region?.type === 'other' ? current.otherText : '',
    }));
    AccessibilityInfo.announceForAccessibility('已选择其他地区，请填写地区名称');
  }

  function selectStandardCity(code: string) {
    // 选了标准城市，之前为「暂未收录」填写的文字作废。
    setDraft((current) => ({ ...current, city: { type: 'standard', code }, cityText: '' }));
  }

  function backToProvinces() {
    setDraft((current) => ({ ...current, step: 'province' }));
    AccessibilityInfo.announceForAccessibility('已返回省级地区列表');
  }

  const displayText = value === null ? '请选择省市' : formatProvinceCitySelection(value);
  const spokenValue = value === null ? '未设置' : formatProvinceCitySelection(value);
  const requirementText = required ? '（必填）' : '（选填）';
  const borderColor = error ? Colors.coral : open ? Colors.mintStrong : Colors.borderLight;

  const draftProvince =
    draft.region?.type === 'province' ? findProvinceByCode(draft.region.code) : null;
  const stepTitle =
    draft.step === 'province'
      ? '第 1 步：选择省级地区'
      : draft.step === 'other'
        ? '其他地区'
        : `第 2 步：选择城市 · ${draftProvince?.displayName ?? ''}`;
  const pendingText = pending === null ? null : formatProvinceCitySelection(pending);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.requirement}>{requirementText}</Text>
      </Text>

      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}，${required ? '必填' : '选填'}，${spokenValue}`}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor },
          pressed && !disabled ? styles.triggerPressed : null,
          disabled ? styles.triggerDisabled : null,
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

      {clearable && !required && value !== null && !disabled ? (
        <View style={styles.clearRow}>
          <Button
            label="清除地区"
            variant="text"
            onPress={() => onChange(null)}
            accessibilityLabel={`清除${label}`}
          />
        </View>
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
              {draft.step === 'province' ? null : (
                <View style={styles.backRow}>
                  <Button
                    label="返回省级列表"
                    variant="text"
                    icon="chevronLeft"
                    onPress={backToProvinces}
                    accessibilityLabel="返回省级地区列表，重新选择省份"
                  />
                </View>
              )}
            </View>

            {/* 省份最多 35 行，大字体下必然超过一屏，列表交给 ScrollView；
                填写框与按钮放在滚动区外，键盘弹出时仍在键盘上方。 */}
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator>
              {draft.step === 'province' ? (
                <>
                  {listSelectableProvinces().map((province) => (
                    <OptionRow
                      key={province.code}
                      label={province.displayName}
                      selected={draft.region?.type === 'province' && draft.region.code === province.code}
                      hint={
                        province.cityCoverage === 'unlisted_only'
                          ? '进入下一步，目录中没有这里的城市，需要填写城市名称'
                          : '进入下一步选择城市'
                      }
                      showChevron
                      onPress={() => selectProvince(province.code)}
                    />
                  ))}
                  <OptionRow
                    label="其他地区"
                    selected={draft.region?.type === 'other'}
                    hint="目录中找不到省份时选择，需要填写地区名称"
                    showChevron
                    onPress={selectOther}
                  />
                </>
              ) : null}

              {draft.step === 'city' && draft.region?.type === 'province' ? (
                <>
                  {listSelectableCities(draft.region.code).map((city) => (
                    <OptionRow
                      key={city.code}
                      label={city.displayName}
                      selected={draft.city?.type === 'standard' && draft.city.code === city.code}
                      onPress={() => selectStandardCity(city.code)}
                    />
                  ))}
                  <OptionRow
                    label="暂未收录"
                    selected={draft.city?.type === 'unlisted'}
                    hint="目录中找不到城市时选择，需要填写城市名称"
                    onPress={() => setDraft((current) => ({ ...current, city: { type: 'unlisted' } }))}
                  />
                </>
              ) : null}

              {draft.step === 'other' ? (
                <Text style={styles.explain}>
                  目录中找不到省份时，直接填写地区名称。填写的内容会原样保存，不会被换成目录中的地区。
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {draft.step === 'city' && draft.city?.type === 'unlisted' ? (
                <TextField
                  label="城市名称"
                  required
                  value={draft.cityText}
                  onChangeText={(text) => setDraft((current) => ({ ...current, cityText: text }))}
                  hint="目录中没有这个城市，按你知道的名称填写"
                  maxLength={50}
                />
              ) : null}
              {draft.step === 'other' ? (
                <TextField
                  label="地区名称"
                  required
                  value={draft.otherText}
                  onChangeText={(text) => setDraft((current) => ({ ...current, otherText: text }))}
                  hint="例如国家、地区或城市的名称"
                  maxLength={50}
                />
              ) : null}

              {/* 弹层压在表单之上，表单底部已有一个实心主按钮，这里不再放第二个。 */}
              <View style={styles.actions}>
                <Button
                  label="使用这个地区"
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
  selected: boolean;
  hint?: string;
  /** 点击后进入下一级 */
  showChevron?: boolean;
  onPress: () => void;
};

/** 一行选项：选中时浅底 + 描边 + 勾选图标 +「已选」文字，不只靠颜色（PRD-NFR-005）。 */
function OptionRow({ label, selected, hint, showChevron = false, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={selected ? `${label}，已选择` : label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed && !selected ? styles.optionPressed : null,
      ]}>
      <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>{label}</Text>
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
  clearRow: {
    alignItems: 'flex-start',
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
  optionLabel: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  optionLabelSelected: {
    ...TextStyles.bodyStrong,
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
