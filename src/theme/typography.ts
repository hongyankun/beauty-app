import { Platform, type TextStyle } from 'react-native';

/**
 * 字体与文字层级 Token，见 docs/UI_REFERENCE.md 第 4 章。
 *
 * 只有两种字体角色，不引入第三种，也不自带字体文件：
 * - `sans`：中文与全部正文、按钮、表单
 * - `serifNumeric`：只用于金额、次数与统计数值
 *
 * 层级靠字号与字重建立，不靠颜色。
 */
export const FontFamily = {
  sans: Platform.select({
    ios: 'PingFang SC',
    web: 'var(--font-display)',
    default: undefined,
  }),
  serifNumeric: Platform.select({
    ios: 'Georgia',
    web: 'var(--font-serif)',
    default: 'serif',
  }),
} as const;

export const FontSize = {
  caption: 13,
  label: 14,
  body: 15,
  sectionTitle: 17,
  pageTitle: 24,
  statValue: 30,
} as const;

/**
 * 预设文字样式。页面直接引用这些常量，避免各处重复写 fontSize / fontWeight。
 * 不在这里写颜色，颜色由使用处从 Colors 取，便于同一层级复用不同语义色。
 */
export const TextStyles = {
  /** 页面主标题 */
  pageTitle: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.pageTitle,
    fontWeight: '700',
    lineHeight: 32,
  },
  /** 区块标题 */
  sectionTitle: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sectionTitle,
    fontWeight: '600',
    lineHeight: 24,
  },
  /** 正文 */
  body: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.body,
    fontWeight: '400',
    lineHeight: 22,
  },
  /** 强调正文，例如列表行主标题 */
  bodyStrong: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.body,
    fontWeight: '600',
    lineHeight: 22,
  },
  /** 标签、按钮文字 */
  label: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.label,
    fontWeight: '500',
    lineHeight: 20,
  },
  /** 辅助说明 */
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.caption,
    fontWeight: '400',
    lineHeight: 18,
  },
  /** 关键统计数值，衬线体，只用于数字 */
  statValue: {
    fontFamily: FontFamily.serifNumeric,
    fontSize: FontSize.statValue,
    fontWeight: '400',
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export type TextStyleToken = keyof typeof TextStyles;
