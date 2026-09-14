/**
 * Fresh Mint 设计 Token 统一出口。
 *
 * 视觉语言以 docs/UI_REFERENCE.md 为准。任何页面或共享组件都只能从这里取值，
 * 不得在组件内硬编码色值、间距与圆角。
 */

// Web 端的字体变量定义（--font-display / --font-serif 等）。
// typography.ts 通过 var(--font-*) 引用，原生端该导入为空操作。
import '@/global.css';

export { Colors, type ColorToken } from './colors';
export { Layout, Spacing, type SpacingToken } from './spacing';
export { BorderWidth, Radii, type RadiusToken } from './radii';
export { FontFamily, FontSize, TextStyles, type TextStyleToken } from './typography';
export { Shadows, type ShadowToken } from './shadows';
