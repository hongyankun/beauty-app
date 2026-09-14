/**
 * 圆角与边框 Token。
 * 仅允许 8 / 12 / 16 / 20，见 docs/UI_REFERENCE.md 第 6 章。
 * 不使用全圆角胶囊形状作为主要按钮样式。
 */
export const Radii = {
  /** 标签、徽标、小控件 */
  tag: 8,
  /** 输入框、次级按钮 */
  input: 12,
  /** 卡片、主按钮 */
  card: 16,
  /** 底部弹层顶部、大面积容器 */
  sheet: 20,
} as const;

/** 统一 1pt 细边框。 */
export const BorderWidth = {
  hairline: 1,
} as const;

export type RadiusToken = keyof typeof Radii;
