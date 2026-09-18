import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { BorderWidth, Colors, Layout, Radii, Spacing, TextStyles } from '@/theme';

export type ArticleSearchBoxProps = {
  value: string;
  onChangeText: (value: string) => void;
};

/**
 * 百科首页的搜索输入框。
 *
 * 共享的 `SearchField` 是一个 `Pressable` 占位控件（点击后跳转），
 * 这里需要真正可以输入的 `TextInput`，因此在 feature 内单独实现一个，
 * 不改动共享组件的既有语义。
 *
 * 视觉沿用 Fresh Mint 输入框：白底、圆角 12、1pt 描边、最小高度 44pt。
 */
export function ArticleSearchBox({ value, onChangeText }: ArticleSearchBoxProps) {
  return (
    <View style={styles.box}>
      <Icon name="search" size={20} color={Colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="搜索项目、护理或关键词"
        placeholderTextColor={Colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="搜索百科内容"
        accessibilityHint="按标题、摘要、标签与别名查找文章"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    minHeight: Layout.minTouchSize,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
  },
  input: {
    ...TextStyles.body,
    flex: 1,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
});
