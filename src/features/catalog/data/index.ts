import { ARTICLES } from './articles';
import { validateArticles } from './validate-articles';

if (__DEV__) {
  const problems = validateArticles(ARTICLES);
  if (problems.length > 0) {
    // 开发环境直接抛错：内容随 App 打包，线上没有修正入口，必须在这里就发现。
    // 生产环境不执行这段检查，界面不会显示任何技术细节。
    throw new Error(`百科内容存在问题：\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  }
}

export { ARTICLES };
