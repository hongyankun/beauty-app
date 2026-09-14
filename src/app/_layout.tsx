import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/theme';

/**
 * 根布局。
 *
 * 第一版只实现浅色视觉（docs/UI_REFERENCE.md 第 1 章），因此这里固定使用浅色主题，
 * 不跟随系统深色模式，也不修改 app.json 的 `userInterfaceStyle`。
 */
const freshMintTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    primary: Colors.mintStrong,
    background: Colors.backgroundWarm,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.borderLight,
    notification: Colors.coral,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={freshMintTheme}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
