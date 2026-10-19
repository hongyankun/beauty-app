import type { ItemGroup } from '../services/list-item-groups';
import type { PurchaseScope } from '../services/list-purchases';

/**
 * 项目视图展示哪一份分组（BT-0024A）。纯函数，供 `useItemGroups` 使用。
 *
 * 读取结果记下它属于哪个购买范围。切换范围后、新结果回来之前，旧范围的分组不再显示，
 * 视为加载中；新范围读取失败时同样不混入旧范围的数据。同一范围的刷新失败仍保留已有内容。
 */
export type ScopedGroups = {
  readonly scope: PurchaseScope;
  readonly groups: readonly ItemGroup[];
};

export type ItemGroupsStatus = 'loading' | 'ready' | 'error';

export function selectScopedGroups(
  loaded: ScopedGroups | null,
  scope: PurchaseScope,
  status: ItemGroupsStatus,
): { readonly status: ItemGroupsStatus; readonly groups: readonly ItemGroup[] } {
  if (loaded === null || loaded.scope !== scope) {
    return { status: status === 'error' ? 'error' : 'loading', groups: [] };
  }
  return { status, groups: loaded.groups };
}
