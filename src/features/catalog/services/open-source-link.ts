import { Linking } from 'react-native';

/** 打不开链接时给用户看的中文说明。 */
export const OPEN_SOURCE_FAILURE_MESSAGE = '没能打开这个链接，可以稍后再试，或手动复制网址在浏览器中打开。';

/**
 * 在系统浏览器中打开资料来源。
 *
 * 用 React Native 自带的 `Linking`，不引入 WebView，也不新增依赖
 * （任务书第十一节、第十三节）。打开前先问系统能不能处理这个链接，
 * 不能处理或调用失败都返回 `false`，由页面给出中文提示，不崩溃。
 */
export async function openSourceLink(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('[catalog] 打开资料来源失败', error);
    }
    return false;
  }
}
