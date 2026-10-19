import { findServiceByCode, getServiceCategoryDisplayName, listServiceCategories } from '@/data/service-catalog';
import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess, type PurchaseItemFactRow, type PurchaseKind } from '@/db';
import type { PurchaseScope } from './list-purchases';

/**
 * 记录 Tab 的项目视图（BT-0024 裁决 4，PRD-EVT-012，DATA_MODEL_V4 第 9.3 节）。
 *
 * 只在**展示层**聚合，不写回数据库，每个套餐项目仍是独立资产：
 * - 目录项目按 `(category_code, service_code)` 分组，代码相同但分类不同不合并；
 * - 自定义项目（`service_code` 为空）每个套餐项目单独一组，不按名称、别名或 legacyExactNames 合并；
 * - 剩余次数逐个套餐项目夹到 0 后相加，已使用只数有效使用记录；
 * - 购买范围与套餐视图同一口径：「可用套餐」不含单次购买。
 */

export type ItemGroupMember = {
  readonly purchaseItemId: string;
  /** 套餐项目当前名称（当前资产，读当前值） */
  readonly itemName: string;
  readonly purchaseId: string;
  readonly purchaseName: string;
  readonly purchaseKind: PurchaseKind;
  readonly expiresOn: BusinessDate | null;
  readonly remaining: number;
  readonly used: number;
};

export type ItemGroup = {
  /** 展示层分组键，只在界面里用于展开状态，不参与任何查询 */
  readonly key: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly remaining: number;
  readonly used: number;
  readonly members: readonly ItemGroupMember[];
};

/** 目录顺序：先分类 sortOrder，再项目 sortOrder；当前目录得不到顺序时为 null。 */
function catalogOrder(serviceCode: string | null): readonly [number, number] | null {
  if (serviceCode === null) {
    return null;
  }
  const entry = findServiceByCode(serviceCode);
  if (entry === null) {
    return null;
  }
  const category = listServiceCategories().find((candidate) => candidate.code === entry.categoryCode);
  return category === undefined ? null : [category.sortOrder, entry.sortOrder];
}

/** 按 UTF-16 码点比较，结果不受运行环境的语言设置影响，排序稳定。 */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

type GroupDraft = {
  key: string;
  name: string;
  categoryLabel: string;
  order: readonly [number, number] | null;
  remaining: number;
  used: number;
  members: ItemGroupMember[];
};

/** 把套餐项目事实按规则分组并排序。纯函数。 */
export function groupItemFacts(rows: readonly PurchaseItemFactRow[], scope: PurchaseScope): ItemGroup[] {
  const groups = new Map<string, GroupDraft>();
  for (const row of rows) {
    if (scope === 'available' && row.purchase_kind !== 'package') {
      continue;
    }
    const remaining = Math.max(0, row.quantity - row.active_count);
    const member: ItemGroupMember = {
      purchaseItemId: row.id,
      itemName: row.name,
      purchaseId: row.purchase_id,
      purchaseName: row.purchase_name,
      purchaseKind: row.purchase_kind,
      expiresOn: row.expires_on,
      remaining,
      used: row.active_count,
    };
    // 分组键只在内存 Map 里使用，不拼进任何 SQL，也不需要解析回来。用 JSON 数组序列化而不是用分隔符拼接：
    // 历史或备份里的分类、代码可能含有任意字符，拼接会让「a:b + c」与「a + b:c」撞成同一个键（BT-0024A）。
    const key =
      row.service_code === null
        ? JSON.stringify(['custom', row.id])
        : JSON.stringify(['service', row.category_code, row.service_code]);
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.remaining += remaining;
      existing.used += row.active_count;
      existing.members.push(member);
      continue;
    }
    const entry = row.service_code === null ? null : findServiceByCode(row.service_code);
    groups.set(key, {
      key,
      // 目录项目取目录当前名称；目录不认识的代码与自定义项目取套餐项目自己的名称（DATA_MODEL_V4 第 8.3 节）。
      name: entry?.displayName ?? (row.service_code === null ? (row.custom_name ?? row.name) : row.name),
      categoryLabel: getServiceCategoryDisplayName(row.category_code),
      order: catalogOrder(row.service_code),
      remaining,
      used: row.active_count,
      members: [member],
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      // 1. 有剩余的组在前。
      const byRemaining = Number(right.remaining > 0) - Number(left.remaining > 0);
      if (byRemaining !== 0) {
        return byRemaining;
      }
      // 2. 目录里有顺序的在前，按分类与项目 sortOrder。
      if (left.order !== null && right.order !== null) {
        const byCategory = left.order[0] - right.order[0];
        if (byCategory !== 0) {
          return byCategory;
        }
        const byService = left.order[1] - right.order[1];
        if (byService !== 0) {
          return byService;
        }
      } else if (left.order !== null || right.order !== null) {
        return left.order !== null ? -1 : 1;
      }
      // 3. 目录得不到顺序的（自定义、未知或历史代码）按显示名称，最后按分组键兜底。
      return compareText(left.name, right.name) || compareText(left.key, right.key);
    })
    .map(({ key, name, categoryLabel, remaining, used, members }) => ({
      key,
      name,
      categoryLabel,
      remaining,
      used,
      members,
    }));
}

/** 读取项目视图的分组。一次查询取齐全部套餐项目事实，在内存中分组。 */
export async function listItemGroups(dataAccess: DataAccess, scope: PurchaseScope): Promise<ItemGroup[]> {
  const rows = await dataAccess.purchases.listItemFacts(DEFAULT_PROFILE_ID);
  return groupItemFacts(rows, scope);
}
