import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, FormScreen, InlineNotice, Screen } from '@/components/ui';
import { DangerConfirmModal } from '@/features/purchases/components/danger-confirm-modal';
import { PurchaseCardSkeleton } from '@/features/purchases/components/purchase-card-skeleton';
import { Colors, Layout, TextStyles } from '@/theme';
import { WishlistForm } from '../components/wishlist-form';
import { useWishlistForm, type WishlistFormMode } from '../hooks/use-wishlist-form';
import { useWishlistItem } from '../hooks/use-wishlist-item';
import type { WishlistItemSummary } from '../wishlist-view';

/**
 * 编辑一条心愿（根 Stack 上的全屏表单，覆盖 Tab 栏）。
 *
 * 外层只负责把 `wishId` 换成一条真实的心愿；表单本身在 `EditWishForm` 里，
 * 拿到数据之后才挂载，这样草稿初值只会被计算一次，
 * 「有没有改动」的比较基准才是稳定的。
 *
 * 永久删除也在这一页完成：心愿只属于用户自己，不被任何记录引用，
 * 删除不会波及机构、套餐与核销（与套餐删除同一口径，ADR-016）。
 */
export function EditWishScreen() {
  const router = useRouter();
  const { wishId } = useLocalSearchParams<{ wishId: string }>();
  const { status, item, reload } = useWishlistItem(wishId);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/wishlist');
    }
  }, [router]);

  if (status === 'loading') {
    return (
      <Screen title="编辑心愿" onBack={goBack} backLabel="取消">
        <PurchaseCardSkeleton accessibilityLabel="正在载入这条心愿" />
      </Screen>
    );
  }

  if (status === 'notFound') {
    return (
      <Screen title="编辑心愿" onBack={goBack} backLabel="取消">
        <EmptyState
          icon="wishlist"
          title="找不到这个心愿"
          description="它可能已经被删除了。返回心愿单看看其他内容。"
          actionLabel="返回心愿单"
          onActionPress={goBack}
        />
      </Screen>
    );
  }

  if (item === null) {
    return (
      <Screen title="编辑心愿" onBack={goBack} backLabel="取消">
        <InlineNotice
          tone="warning"
          message="没能读取这条心愿，暂时无法编辑。"
          actionLabel="重试"
          onActionPress={reload}
        />
      </Screen>
    );
  }

  // 用心愿 ID 作为 key：换一条心愿时表单整体重建，初值不会沿用上一条。
  return <EditWishForm key={item.id} item={item} />;
}

function EditWishForm({ item }: { item: WishlistItemSummary }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // `mode` 进了表单 hook 的依赖数组，每次渲染新建一个对象会让提交与删除回调跟着重建。
  const mode = useMemo<WishlistFormMode>(
    () => ({
      kind: 'edit',
      wishlistItemId: item.id,
      source: {
        name: item.name,
        category: item.category,
        institutionId: item.institutionId,
        plannedOn: item.plannedOn,
        budgetMinor: item.budgetMinor,
        notes: item.notes,
      },
    }),
    [item],
  );
  const form = useWishlistForm(mode);

  const openDeleteConfirm = useCallback(() => setConfirmingDelete(true), []);
  const cancelDelete = useCallback(() => setConfirmingDelete(false), []);

  return (
    <FormScreen
      title="编辑心愿"
      subtitle="修改这条心愿的名称、分类、机构、时间与预算。"
      onCancel={form.cancel}
      footer={
        <Button
          label={form.saving ? '正在保存…' : '保存修改'}
          variant="primary"
          loading={form.saving}
          onPress={form.submit}
          accessibilityLabel="保存修改"
        />
      }
    >
      {form.formError ? <InlineNotice tone="warning" message={form.formError} /> : null}

      <WishlistForm form={form} />

      <View style={styles.dangerBlock}>
        {/* 次要危险操作：白底 + 珊瑚色描边，不铺大面积红（UI_REFERENCE 第 10 章）。 */}
        <Button
          label="删除心愿"
          variant="danger"
          onPress={openDeleteConfirm}
          accessibilityLabel={`删除心愿${item.name}`}
        />
        <Text style={styles.dangerHint}>
          删除后不可恢复。这只会删掉这条心愿，已有的套餐、核销记录与机构都不受影响。
        </Text>
      </View>

      <DangerConfirmModal
        visible={confirmingDelete}
        title="永久删除这个心愿？"
        description="删除后不可恢复：App 内没有回收站，也没有恢复入口。已有的套餐、核销记录与机构都不会受到影响。"
        facts={[{ label: '心愿', value: item.name }]}
        confirmLabel="永久删除"
        confirmingLabel="正在删除…"
        confirming={form.deleting}
        error={form.deleteError}
        onCancel={cancelDelete}
        onConfirm={form.remove}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  dangerBlock: {
    gap: Layout.labelGap,
  },
  dangerHint: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
  },
});
