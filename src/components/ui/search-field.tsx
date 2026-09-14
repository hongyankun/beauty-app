import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from './icon';
import { BorderWidth, Colors, Layout, Radii, TextStyles } from '@/theme';

export type SearchFieldProps = {
  /** 占位文案，同时作为读屏标签的一部分 */
  placeholder: string;
  onPress: () => void;
};

/**
 * 搜索入口的外观件。本任务只做静态骨架，点击后进入占位提示，
 * 真实搜索在后续任务实现，因此这里不是可输入的 TextInput。
 */
export function SearchField({ placeholder, onPress }: SearchFieldProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [styles.field, pressed ? styles.pressed : null]}
    >
      <Icon name="search" size={20} color={Colors.textSecondary} />
      <Text style={styles.placeholder}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: Layout.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.iconGap,
    paddingHorizontal: Layout.cardPadding,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: BorderWidth.hairline,
    borderColor: Colors.borderLight,
  },
  pressed: {
    opacity: 0.7,
  },
  placeholder: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
});
