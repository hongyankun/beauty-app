import { HomeScreen } from '@/features/home/screens/home-screen';

/**
 * 路由 `/(tabs)/home`：首页总览。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 * 消费统计（`home/stats`）属于 R4，本阶段不建。
 */
export default function HomeRoute() {
  return <HomeScreen />;
}
