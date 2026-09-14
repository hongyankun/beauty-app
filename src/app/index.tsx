import { Redirect } from 'expo-router';

/**
 * 根路径入口。
 *
 * Expo Router 在原生冷启动时强制把初始路径设为 `/`
 * （见 expo-router/build/link/linking.js 的 getInitialURL）。
 * 五个 Tab 收口为独立 Stack 后，`/` 不再对应任何页面，
 * 因此这里把 `/` 指向首页，保证默认启动进入首页。
 *
 * 这不是为已废弃的临时扁平路由做兼容，只是根路径的落点声明。
 */
export default function RootIndex() {
  return <Redirect href="/home" />;
}
