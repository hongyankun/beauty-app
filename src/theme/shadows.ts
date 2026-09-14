import { Platform, type ViewStyle } from 'react-native';

import { Colors } from './colors';

/**
 * 阴影 Token，见 docs/UI_REFERENCE.md 第 6.3 章。
 *
 * 只允许极轻阴影，且只用于浮层（底部弹层、吸顶栏滚动分界）。
 * 常规卡片不加阴影，用「白底 + 1pt borderLight」分层。
 * 不使用多层阴影、彩色阴影与内阴影。
 */
export const Shadows = {
  /** 常规卡片：无阴影 */
  none: {} satisfies ViewStyle,
  /** 浮层：小偏移、大模糊、低不透明度 */
  overlay: Platform.select<ViewStyle>({
    ios: {
      shadowColor: Colors.textPrimary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    android: {
      elevation: 2,
    },
    default: {
      // textPrimary 的 6% 不透明度，与 iOS 分支保持一致
      boxShadow: '0 2px 12px rgba(48, 50, 47, 0.06)',
    },
  }),
} as const;

export type ShadowToken = keyof typeof Shadows;
