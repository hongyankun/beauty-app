import { ArticleDetailScreen } from '@/features/catalog/screens/article-detail-screen';

/**
 * 路由 `/(tabs)/catalog/[entryId]`：百科文章详情。
 *
 * 路径与参数名沿用 IA 第 4 节的既有规划。`entryId` 传的是文章的 slug，
 * 页面自己去本地内容里找，路由不传任何正文数据。
 * 压在百科 Tab 自己的栈里，保留 Tab 栏（IA 第 4.3 节第 2 条）。
 *
 * 同一个 `ArticleDetailScreen` 还被心愿单 Tab 的薄路由
 * `/(tabs)/wishlist/article/[entryId]` 复用，两边不是两份页面实现。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function ArticleDetailRoute() {
  return <ArticleDetailScreen />;
}
