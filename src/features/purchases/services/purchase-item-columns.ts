import {
  findServiceByCode,
  getServiceCategoryDisplayName,
  isServiceCategoryCode,
  isValidNewServiceSelection,
} from '@/data/service-catalog';
import { PURCHASE_ITEM_CATEGORIES, type PurchaseItemCategory } from '@/db';
import { PurchaseServiceError } from './errors';

/**
 * schema v4 套餐项目的「做了什么项目」三列与表单之间的换算（BT-0021B）。
 *
 * 一个套餐项目的**身份**是 `(category_code, service_code, custom_name)` 三列：目录项目带代码，
 * 自定义项目带自定义名称（DATA_MODEL_V4 第 4.4 节）。`name` 是套餐项目当前的显示名称，
 * 可以单独修改，**不是**身份：改名不会把目录项目变成自定义项目，也不会改写任何使用记录快照
 * （PRD 第 5B.5 节）。
 *
 * 严格校验只在两种时候发生（ARCHITECTURE 第 6 节）：新增项目；编辑时身份与**事务内**读到的
 * 库值不同。身份没变时三列原样写回——当前目录不认识的分类或代码、已停用的项目、
 * 迁移前遗留的「代码与名称都有」的行都照常保存，不清空、不改写、不拒绝。
 */

/** 表单与 service 之间传递的项目身份。字段名与 `ServiceSelection` 一致，可以直接交给严格校验。 */
export type PurchaseItemIdentity = {
  readonly categoryCode: string;
  readonly serviceCode: string | null;
  readonly customName: string | null;
};

/** 写进 `purchase_items` 的三列。 */
export type PurchaseItemIdentityColumns = {
  readonly category_code: string;
  readonly service_code: string | null;
  readonly custom_name: string | null;
};

/** 表单认得的分类；库里出现目录之外的代码时（只可能来自备份）按「其他」展示。 */
export function toFormCategory(categoryCode: string): PurchaseItemCategory {
  return (PURCHASE_ITEM_CATEGORIES as readonly string[]).includes(categoryCode)
    ? (categoryCode as PurchaseItemCategory)
    : 'other';
}

/** 库里三列 → 表单身份，原样照搬，不做任何清洗或推断。 */
export function identityFromColumns(columns: PurchaseItemIdentityColumns): PurchaseItemIdentity {
  return {
    categoryCode: columns.category_code,
    serviceCode: columns.service_code,
    customName: columns.custom_name,
  };
}

/** 两个身份的三列是否逐字相同。名称按原文比较：清洗前后不同也算变了，交给严格校验裁决。 */
export function isSameIdentity(left: PurchaseItemIdentity, right: PurchaseItemIdentity): boolean {
  return (
    left.categoryCode === right.categoryCode &&
    left.serviceCode === right.serviceCode &&
    left.customName === right.customName
  );
}

/**
 * 保存时写入的三列。
 *
 * - `stored` 是事务内读到的这一行（新增项目为 null）。
 * - 与库值逐字相同：原样写回，不做目录校验。不存在「我没改」的标记，客户端伪造的「未改动」
 *   只会因为三列对不上而走严格校验。
 * - 否则：必须通过 `isValidNewServiceSelection`（七个分类之一；目录项目在用且属于该分类、
 *   不带自定义名称；自定义项目名称已清洗且非空；字段不多不少）。
 */
export function resolveItemIdentity(
  stored: PurchaseItemIdentityColumns | null,
  input: PurchaseItemIdentity,
  itemName: string,
): PurchaseItemIdentityColumns {
  if (stored !== null && isSameIdentity(identityFromColumns(stored), input)) {
    return {
      category_code: stored.category_code,
      service_code: stored.service_code,
      custom_name: stored.custom_name,
    };
  }
  if (!isValidNewServiceSelection(input)) {
    throw new PurchaseServiceError(
      `「${itemName.trim()}」选择的项目不在当前项目目录中，请重新选择项目`,
    );
  }
  return {
    category_code: input.categoryCode,
    service_code: input.serviceCode,
    custom_name: input.customName,
  };
}

/**
 * 新增的自定义项目，显示名称必须等于自定义名称（DATA_MODEL_V4 第 4.4 节：新建时自定义则等于
 * `custom_name`）。之后编辑已有项目时才可以单独改显示名称，`custom_name` 原样保留，
 * 供修正来源按自定义名称匹配（PRD 第 5B.2 节）。只用于新增的行，已有行不调用。
 */
export function assertNewItemNameMatchesIdentity(input: PurchaseItemIdentity, itemName: string): void {
  if (input.serviceCode === null && input.customName !== null && itemName.trim() !== input.customName) {
    throw new PurchaseServiceError(
      `「${itemName.trim()}」的项目名称需要与自定义项目名称一致，请在「项目」中修改名称`,
    );
  }
}

/** 项目身份在界面上的呈现。只用于展示，不改写数据。 */
export type PurchaseItemIdentityDisplay = {
  /** 分类中文名；未知分类显示「其他」 */
  readonly categoryLabel: string;
  /** 项目名：目录项目取目录当前名称；自定义取自定义名称；目录不认识时退回项目名称 */
  readonly serviceLabel: string;
  readonly kind: 'standard' | 'custom';
  /** 需要额外说明的历史情况；没有时为 null */
  readonly note: string | null;
};

/**
 * 身份的展示文字（DATA_MODEL_V4 第 8.3 节）：
 * 未知分类显示「其他」并说明；未知代码显示项目名称并标注「目录中未收录」；
 * 已停用项目照常显示目录名称并标注「已停用」。
 */
export function describeItemIdentity(
  identity: PurchaseItemIdentity,
  itemName: string,
): PurchaseItemIdentityDisplay {
  const categoryLabel = getServiceCategoryDisplayName(identity.categoryCode);
  const notes: string[] = [];
  if (!isServiceCategoryCode(identity.categoryCode)) {
    notes.push('原分类目录中未收录，按「其他」显示');
  }

  if (identity.serviceCode === null) {
    const customName = identity.customName ?? itemName;
    return {
      categoryLabel,
      serviceLabel: customName.trim() === '' ? itemName : customName,
      kind: 'custom',
      note: notes.length > 0 ? notes.join('；') : null,
    };
  }

  const entry = findServiceByCode(identity.serviceCode);
  if (entry === null) {
    notes.push('目录中未收录');
  } else {
    if (entry.status !== 'active') {
      notes.push('已停用');
    }
    if (entry.categoryCode !== identity.categoryCode) {
      notes.push('与当前分类不一致');
    }
  }
  return {
    categoryLabel,
    serviceLabel: entry?.displayName ?? itemName,
    kind: 'standard',
    note: notes.length > 0 ? notes.join('；') : null,
  };
}
