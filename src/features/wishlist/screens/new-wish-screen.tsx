import { useMemo } from 'react';

import { Button, FormScreen, InlineNotice } from '@/components/ui';
import { WishlistForm } from '../components/wishlist-form';
import { useWishlistForm, type WishlistFormMode } from '../hooks/use-wishlist-form';

/**
 * 新增心愿（根 Stack 上的全屏表单，覆盖 Tab 栏）。
 *
 * 字段、校验、提交闸门与返回拦截都来自与编辑页共用的 `useWishlistForm` +
 * `WishlistForm`；这里只决定标题、按钮文案与「这是新增」这件事
 * （ARCHITECTURE 第三节的分层）。
 */
export function NewWishScreen() {
  // `mode` 进了表单 hook 的依赖数组，每次渲染新建一个对象会让提交回调跟着重建。
  const mode = useMemo<WishlistFormMode>(() => ({ kind: 'create' }), []);
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

      <WishlistForm form={form} />
    </FormScreen>
  );
}
