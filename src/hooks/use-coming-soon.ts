import { useCallback } from 'react';
import { Alert } from 'react-native';

/**
 * 骨架阶段的占位交互。
 *
 * 本任务只搭建静态 UI，任何入口都不得点击无响应，也不得跳转到不存在的路由
 * （docs/INFORMATION_ARCHITECTURE.md 第 4.3 节第 6 条）。
 * 后续任务实现真实页面后，逐个替换这些调用。
 */
export function useComingSoon() {
  return useCallback((featureName: string) => {
    Alert.alert(featureName, '将在后续任务中开放。', [{ text: '知道了' }]);
  }, []);
}
