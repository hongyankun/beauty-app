import { Tabs } from 'expo-router';

import { Icon } from '@/components/ui';
import { BorderWidth, Colors, FontFamily } from '@/theme';

/**
 * 五个一级 Tab，顺序固定：首页、记录、百科、心愿单、我的
 * （docs/INFORMATION_ARCHITECTURE.md 第 1 节、docs/UI_REFERENCE.md 第 12 章）。
 *
 * 每个 Tab 指向一个拥有独立 Stack 的目录。`catalog` 是路由内部名称，界面显示「百科」。
 *
 * 这里使用 Expo Router 的经典 `Tabs` 而不是 `NativeTabs`：
 * UI 基线要求白底 + 顶部 1pt borderLight 分隔线、选中态为 mintStrong、
 * 不使用胶囊背景与指示条，这些在 iOS 原生 UITabBar 上无法控制。
 */
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.mintStrong,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: BorderWidth.hairline,
          borderTopColor: Colors.borderLight,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamily.sans,
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <Icon name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '记录',
          tabBarIcon: ({ color }) => <Icon name="records" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: '百科',
          tabBarIcon: ({ color }) => <Icon name="catalog" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: '心愿单',
          tabBarIcon: ({ color }) => <Icon name="wishlist" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => <Icon name="me" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
