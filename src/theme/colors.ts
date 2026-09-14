/**
 * Fresh Mint 色彩 Token。
 *
 * 色值与命名必须与 docs/UI_REFERENCE.md 第 3 章保持一致。
 * 页面与组件不得硬编码十六进制色值，一律从这里取。
 * 第一版只实现浅色视觉，不提供深色主题。
 */
export const Colors = {
  /** 页面底色，暖白 */
  backgroundWarm: '#FAFCF9',
  /** 卡片、弹层、输入框底色 */
  surface: '#FFFFFF',
  /** 主色深色变体：实心主按钮底色、选中 Tab、可点击的薄荷绿文字等需要足够对比度的交互前景 */
  mintStrong: '#3F806C',
  /** 主色：装饰性图标、较浅强调与非文字视觉元素 */
  mintPrimary: '#8FCDB8',
  /** 主色浅底：标签、选中背景、轻量强调区 */
  mintLight: '#E6F5ED',
  /** 警示：临期、过期、删除、错误 */
  coral: '#F4A39A',
  /** 警示浅底：警示标签与提示条背景 */
  coralLight: '#FDE7E3',
  /** 主文字：标题、正文、金额 */
  textPrimary: '#30322F',
  /** 次要文字：标签、辅助说明、占位符 */
  textSecondary: '#6E746F',
  /** 分隔线、卡片描边、输入框描边 */
  borderLight: '#E4EAE6',
} as const;

export type ColorToken = keyof typeof Colors;
