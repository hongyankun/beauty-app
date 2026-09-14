/**
 * 间距 Token，基础栅格 8pt，允许 4pt 半格微调。
 * 仅允许 4 / 8 / 12 / 16 / 20 / 24 / 32，见 docs/UI_REFERENCE.md 第 5 章。
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** 常用间距语义别名，便于页面表达意图而不是记数字。 */
export const Layout = {
  /** 页面左右安全边距 */
  pageHorizontal: Spacing.lg,
  /** 卡片内部内边距 */
  cardPadding: Spacing.lg,
  /** 卡片之间的垂直间距 */
  cardGap: Spacing.md,
  /** 区块之间的垂直间距 */
  sectionGap: Spacing.xxl,
  /** 表单项之间的垂直间距 */
  fieldGap: Spacing.xl,
  /** 标签与其输入框之间 */
  labelGap: Spacing.sm,
  /** 图标与相邻文字之间 */
  iconGap: Spacing.sm,
  /** 紧密关联的两行文字之间 */
  tightGap: Spacing.xs,
  /** 最小触控区域，见 docs/UI_REFERENCE.md 第 14 章 */
  minTouchSize: 44,
} as const;

export type SpacingToken = keyof typeof Spacing;
