import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type TextFieldProps = {
  /** 可见标签，与输入框关联（PRD-NFR-004）。占位符不能替代标签 */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** 标签右侧标注「必填」 */
  required?: boolean;
  /** 输入框下方的常驻说明，例如格式示例 */
  hint?: string;
  /** 校验失败原因。同时改描边颜色与显示文字，不只变红（PRD-NFR-005） */
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** 读屏标签；默认由 label 与必填状态拼出 */
  accessibilityLabel?: string;
  editable?: boolean;
};

/**
 * 表单文本输入：标签在上、输入框在下（docs/UI_REFERENCE.md 第 9 章）。
 *
 * 白底、圆角 12、1pt 描边、最小高度 44pt；聚焦时描边转 `mintStrong`，
 * 出错时转 `coral` 并在下方给出 `coral` 文字说明。
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  hint,
  error,
  keyboardType = 'default',
  multiline = false,
  maxLength,
  autoCapitalize = 'none',
  accessibilityLabel,
  editable = true,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? Colors.coral
    : focused
      ? Colors.mintStrong
      : Colors.borderLight;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.requirement}>{required ? '（必填）' : '（选填）'}</Text>
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        accessibilityLabel={accessibilityLabel ?? `${label}${required ? '，必填' : '，选填'}`}
        accessibilityHint={error ?? hint}
        style={[styles.input, multiline ? styles.inputMultiline : null, { borderColor }]}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
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
  input: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    minHeight: Layout.minTouchSize,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  inputMultiline: {
    minHeight: Layout.minTouchSize * 2,
    textAlignVertical: 'top',
  },
  error: {
    ...TextStyles.caption,
    color: Colors.coral,
  },
  hint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
