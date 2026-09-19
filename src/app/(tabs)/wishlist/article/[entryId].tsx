import { ArticleDetailScreen } from '@/features/catalog/screens/article-detail-screen';

/**
 * 路由 `/(tabs)/wishlist/article/[entryId]`：从「收藏文章」打开的百科文章详情。
 *
 * 和 `/(tabs)/catalog/[entryId]` 渲染的是**同一个** `ArticleDetailScreen`，
 * 这里没有第二份文章正文、收藏逻辑或加入心愿逻辑，只是把同一个页面挂进
 * 心愿单 Tab 自己的栈里。
 *
 * 这样做是为了让返回行为对齐：详情压在心愿单栈上，页面返回按钮、iOS 侧滑、
 * Android 实体返回键与原生栈弹出走的都是同一条路径，全部落回收藏文章列表，
 * 不需要监听返回事件，也不需要「先 back 再 navigate」的补丁（IA 第 4 节规划要点）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function FavoriteArticleDetailRoute() {
  return <ArticleDetailScreen backLabel="返回收藏" fallbackHref="/(tabs)/wishlist" />;
}
