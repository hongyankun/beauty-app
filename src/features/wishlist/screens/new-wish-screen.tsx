import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { Button, FormScreen, InlineNotice } from '@/components/ui';
import { ARTICLES } from '@/features/catalog/data';
import { findArticle } from '@/features/catalog/services/get-article';
import { createWishlistSourceFromArticle } from '../article-prefill';
import { WishlistForm } from '../components/wishlist-form';
import { useWishlistForm, type WishlistFormMode } from '../hooks/use-wishlist-form';

const PREFILLED_NOTICE = '已带入这篇百科文章的名称，你可以修改后再保存。';
const ARTICLE_MISSING_NOTICE = '没有找到对应的百科内容，你仍可以手动填写心愿。';

/**
 * 新增心愿（根 Stack 上的全屏表单，覆盖 Tab 栏）。
 *
 * 字段、校验、提交闸门与返回拦截都来自与编辑页共用的 `useWishlistForm` +
 * `WishlistForm`；这里只决定标题、按钮文案与「这是新增」这件事
 * （ARCHITECTURE 第三节的分层）。
 *
 * 带 `articleSlug` 进来时会从对应的百科文章预填名称与分类。预填只是初始值，
 * 保存下来的心愿与手动新增的完全一样，不保留任何与文章的关联（任务书第八节）。
 */
export function NewWishScreen() {
  const { articleSlug } = useLocalSearchParams<{ articleSlug?: string }>();

  /**
   * 初值与提示只算一次。
   *
   * `mode` 进了表单 hook 的依赖数组，每次渲染新建一个对象会让提交回调跟着重建。
   */
  const { mode, notice } = useMemo<{ mode: WishlistFormMode; notice: string | null }>(() => {
    if (articleSlug === undefined || articleSlug === '') {
      // 没带参数就是普通的空白新增流程，什么都不提示。
      return { mode: { kind: 'create' }, notice: null };
    }

    const article = findArticle(ARTICLES, articleSlug);
    if (article === undefined) {
      // 文章可能已经改名或下线。这不是用户的错，也不是故障：
      // 给一句中性说明，照常打开空白表单，不显示任何技术细节（任务书第 8.3 节）。
      if (__DEV__) {
        console.error('[wishlist] 预填用的文章 slug 不存在', articleSlug);
      }
      return { mode: { kind: 'create' }, notice: ARTICLE_MISSING_NOTICE };
    }

    return {
      mode: { kind: 'create', source: createWishlistSourceFromArticle(article) },
      notice: PREFILLED_NOTICE,
    };
  }, [articleSlug]);

  const form = useWishlistForm(mode);

  return (
    <FormScreen
      title="添加心愿"
      subtitle="记下想了解或打算做的项目，只有名称是必填的。"
      onCancel={form.cancel}
      footer={
        <Button
          label={form.saving ? '正在保存…' : '保存心愿'}
          variant="primary"
          loading={form.saving}
          onPress={form.submit}
          accessibilityLabel="保存心愿"
        />
      }
    >
      {form.formError ? <InlineNotice tone="warning" message={form.formError} /> : null}
      {notice ? <InlineNotice tone="neutral" message={notice} /> : null}

      <WishlistForm form={form} />
    </FormScreen>
  );
}
