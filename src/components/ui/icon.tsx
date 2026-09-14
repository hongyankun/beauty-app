import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/theme';

type SymbolName = {
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
};

/**
 * 图标登记表。页面只使用这里的语义名，不直接写平台符号名。
 *
 * iOS 渲染 SF Symbols，Android 与 Web 渲染 Material Symbols，
 * 两侧都为线性风格，符合 docs/UI_REFERENCE.md 第 7 章。
 */
const ICONS = {
  home: { ios: 'house', android: 'home', web: 'home' },
  records: { ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' },
  catalog: { ios: 'book', android: 'menu_book', web: 'menu_book' },
  wishlist: { ios: 'heart', android: 'favorite', web: 'favorite' },
  me: { ios: 'person', android: 'person', web: 'person' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  inbox: { ios: 'tray', android: 'inbox', web: 'inbox' },
  bookmark: { ios: 'bookmark', android: 'bookmark', web: 'bookmark' },
  calendar: { ios: 'calendar', android: 'event', web: 'event' },
  device: { ios: 'wand.and.rays', android: 'healing', web: 'healing' },
  material: { ios: 'syringe', android: 'vaccines', web: 'vaccines' },
  ingredient: { ios: 'drop', android: 'water_drop', web: 'water_drop' },
  principle: { ios: 'text.book.closed', android: 'auto_stories', web: 'auto_stories' },
  treatment: { ios: 'sparkles', android: 'spa', web: 'spa' },
  dataExport: { ios: 'arrow.down.doc', android: 'description', web: 'description' },
  privacy: { ios: 'lock.shield', android: 'lock', web: 'lock' },
  about: { ios: 'info.circle', android: 'info', web: 'info' },
} satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  /** 列表与表单内 20，导航与 Tab 24，空状态 32 以上 */
  size?: number;
  /** 兼容 React Navigation 传入的 ColorValue */
  color?: ColorValue;
  /** 纯图标控件必须提供；装饰性图标留空即对读屏隐藏 */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Icon({
  name,
  size = 24,
  color = Colors.textSecondary,
  accessibilityLabel,
  style,
}: IconProps) {
  const decorative = accessibilityLabel === undefined;

  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
      fallback={<View style={{ width: size, height: size }} />}
      accessible={!decorative}
      accessibilityRole={decorative ? 'none' : 'image'}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    />
  );
}
