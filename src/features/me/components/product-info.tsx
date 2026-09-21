import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Layout, TextStyles } from '@/theme';

/**
 * 产品名称。
 *
 * 中文名是唯一的用户可见主名，英文名只在需要同时出现时跟在后面。
 * 这里写成字面量而不是从 Expo 配置里读：`app.json` 里的 `name` 是给操作系统
 * 和 Expo Go 项目列表用的，它未来可能因为发布渠道而变形（带后缀、带环境标记），
 * 界面里该显示什么不应该跟着那件事走（BT-0018A 第三、五节）。
 *
 * 版本号则相反，必须只有一个来源，见下面的 `appVersion`。
 */
const PRODUCT_NAME = '美迹';
const PRODUCT_TAGLINE = 'iBeauty · 本地试用版';

/**
 * 当前版本号，来自 `app.json` 的 `expo.version`。
 *
 * **不在这里手写第二份版本号**：手写的那份迟早会和 `app.json` 对不上，
 * 而用户报问题时报的正是界面上看到的这个数（BT-0018A 第五节）。
 * `expoConfig` 在极少数运行环境下可能为空，此时如实说"未知"，不编一个。
 */
const appVersion = Constants.expoConfig?.version ?? null;

/**
 * 「我的」页面底部的产品信息。
 *
 * 只说三件事：这是什么 App、现在是什么阶段、数据在哪。
 *
 * 刻意不显示 bundle identifier、Expo 项目标识、数据库版本与任何本机路径：
 * 这些对用户没有意义，却会在用户截图求助时一起被发出去（BT-0018A 第五节）。
 * 也刻意不做成卡片、不加图标、不加任何可点击项——这一屏的主角是上面的
 * 数据管理与设置入口，产品信息只是页脚（UI_REFERENCE 第 10 章）。
 *
 * 文字不设 `numberOfLines`：系统字体放大到最大档时宁可换行，不能截断（PRD-NFR-006）。
 */
export function ProductInfo() {
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{PRODUCT_NAME}</Text>
      <Text style={styles.meta}>{PRODUCT_TAGLINE}</Text>
      <Text style={styles.meta}>{appVersion === null ? '版本未知' : `版本 ${appVersion}`}</Text>
      <Text style={styles.privacy}>
        数据默认保存在本机，只有在你主动导出或分享时才会离开设备。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Layout.tightGap,
    paddingTop: Layout.cardGap,
  },
  name: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  meta: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
  privacy: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    paddingTop: Layout.tightGap,
    textAlign: 'center',
  },
});
