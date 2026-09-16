import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, TextField } from '@/components/ui';
import type { InstitutionOption } from '@/db';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';
import { cleanInstitutionName, normalizeInstitutionName } from '@/utils/institution-name';
import type { InstitutionDraftMode } from '../purchase-draft';

/** 建议列表最多展示的条数，避免机构变多后把整个表单顶下去。 */
const MAX_SUGGESTIONS = 5;

export type InstitutionPickerProps = {
  options: readonly InstitutionOption[];
  mode: InstitutionDraftMode;
  institutionId: string | null;
  /** 同时承担搜索关键词与新机构名称两个角色 */
  query: string;
  error?: string;
  onQueryChange: (query: string) => void;
  onSelectExisting: (option: InstitutionOption) => void;
  onClear: () => void;
};

/**
 * 机构选择器：可搜索的已有机构 + 当场新增。
 *
 * PRD 第 5A.2 节明确要求这个字段是「可搜索的选择器 + 当场新增」而不是纯文本框，
 * 否则每次录入都会打出一个新的同名机构，机构无法复用（PRD-INST-002）。
 *
 * 用户直接打字而不点建议项也没问题：service 会按 `normalized_name` 判重，
 * 同名时复用已有机构而不是新建一条，所以这里不强制用户先点一下。
 */
export function InstitutionPicker({
  options,
  mode,
  institutionId,
  query,
  error,
  onQueryChange,
  onSelectExisting,
  onClear,
}: InstitutionPickerProps) {
  const keyword = normalizeInstitutionName(query);

  const suggestions = useMemo(() => {
    if (keyword === '') {
      return options.slice(0, MAX_SUGGESTIONS);
    }
    return options
      .filter((option) => normalizeInstitutionName(option.name).includes(keyword))
      .slice(0, MAX_SUGGESTIONS);
  }, [options, keyword]);

  const selected = mode === 'existing' ? options.find((o) => o.id === institutionId) : undefined;

  // 打字内容与某个已有机构完全同名时不再提示「新增」，那会让用户以为要多建一家。
  const cleanedQuery = cleanInstitutionName(query);
  const matchesExisting = options.some((o) => normalizeInstitutionName(o.name) === keyword);
  const showCreateHint = mode === 'new' && cleanedQuery !== '' && !matchesExisting;

  return (
    <View style={styles.group}>
      <TextField
        label="机构"
        value={query}
        onChangeText={onQueryChange}
        placeholder="搜索已有机构，或直接输入名称"
        hint="留空表示暂不记录机构，之后可以补填"
        error={error}
        accessibilityLabel="机构，选填，可搜索已有机构或输入新名称"
      />

      {selected ? (
        <View style={styles.selected}>
          <Icon name="check" size={20} color={Colors.mintStrong} />
          <Text style={styles.selectedText} numberOfLines={2}>
            已选择「{selected.name}」
          </Text>
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="清除已选择的机构"
            hitSlop={Layout.labelGap}
            style={({ pressed }) => [styles.clear, pressed ? styles.pressed : null]}
          >
            <Text style={styles.clearLabel}>清除</Text>
          </Pressable>
        </View>
      ) : null}

      {mode !== 'existing' && suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsTitle}>
            {keyword === '' ? '最近使用的机构' : '匹配到的机构'}
          </Text>
          {suggestions.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onSelectExisting(option)}
              accessibilityRole="button"
              accessibilityLabel={`选择机构 ${option.name}${option.city ? `，${option.city}` : ''}`}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <Text style={styles.rowName} numberOfLines={1}>
                {option.name}
              </Text>
              {option.city ? <Text style={styles.rowCity}>{option.city}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {showCreateHint ? (
        <Text style={styles.createHint}>保存后会新增机构「{cleanedQuery}」，之后可以直接选用。</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Layout.labelGap,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: Layout.minTouchSize,
    backgroundColor: Colors.mintLight,
    borderRadius: Radii.tag,
  },
  selectedText: {
    ...TextStyles.label,
    color: Colors.textPrimary,
    flex: 1,
  },
  clear: {
    minHeight: Layout.minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  clearLabel: {
    ...TextStyles.label,
    color: Colors.mintStrong,
  },
  suggestions: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.xs,
  },
  suggestionsTitle: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  row: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Layout.iconGap,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  rowName: {
    ...TextStyles.body,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  rowCity: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  createHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
