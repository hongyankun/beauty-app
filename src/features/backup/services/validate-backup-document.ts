import { PURCHASE_ITEM_CATEGORIES, REDEMPTION_STATUSES } from '@/db';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BackupDocument } from '../backup-document';

/**
 * 备份自检的结果。
 *
 * `issues` 是**技术性**说明，只用于 `__DEV__` 日志与自动化验证，
 * 永远不会展示给用户：用户看到的是第九节规定的那几句中文（任务书第九节）。
 */
export type BackupValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] };

/** 本版本能够识别的格式版本。往后新增版本时在这里登记，不是随便比大小。 */
const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [BACKUP_FORMAT_VERSION];

/** 问题列表的上限。一份结构彻底不对的文件会产生成千上万条，记那么多没有意义。 */
const MAX_ISSUES = 20;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FieldKind =
  /** 非空字符串，用于主键与外键。 */
  | 'id'
  | 'text'
  | 'nullableText'
  | 'integer'
  | 'nullableInteger'
  /** SQLite 里的布尔：只能是 0 或 1。 */
  | 'flag'
  | 'date'
  | 'nullableDate'
  | 'timestamp'
  | 'nullableTimestamp'
  | 'category'
  | 'nullableCategory'
  | 'status';

type RowSpec = Readonly<Record<string, FieldKind>>;

const PROFILE_SPEC: RowSpec = {
  id: 'id',
  display_name: 'text',
  is_default: 'flag',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const INSTITUTION_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  name: 'text',
  normalized_name: 'text',
  city: 'nullableText',
  notes: 'nullableText',
  is_archived: 'flag',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const PURCHASE_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  city_snapshot: 'nullableText',
  name: 'text',
  purchase_date: 'date',
  total_amount_minor: 'integer',
  currency: 'text',
  expires_on: 'nullableDate',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const PURCHASE_ITEM_SPEC: RowSpec = {
  id: 'id',
  purchase_id: 'id',
  name: 'text',
  category: 'category',
  quantity: 'integer',
  unit_amount_minor: 'integer',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const REDEMPTION_SPEC: RowSpec = {
  id: 'id',
  purchase_item_id: 'id',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  city_snapshot: 'nullableText',
  redeemed_on: 'date',
  status: 'status',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
  voided_at: 'nullableTimestamp',
  void_reason: 'nullableText',
};

const WISHLIST_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  name: 'text',
  category: 'nullableCategory',
  institution_id: 'nullableText',
  planned_on: 'nullableDate',
  budget_minor: 'nullableInteger',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const FAVORITE_SPEC: RowSpec = {
  profile_id: 'id',
  article_slug: 'id',
  created_at: 'timestamp',
};

/**
 * 校验一份备份是否结构完整、内部自洽。
 *
 * 纯函数：只看传进来的值，不读数据库、不读时钟、不读文件系统，
 * 因此导出前后都能跑，自动化验证里也能直接喂构造出来的坏数据。
 *
 * 它检查三类东西：
 *
 * 1. **信封**——`format` 对不对、`formatVersion` 认不认识、元数据齐不齐。
 * 2. **每一行的字段**——缺字段、类型错、日期格式错、枚举越界、布尔不是 0/1。
 * 3. **内部引用**——项目挂在不存在的套餐上、核销引用不存在的项目、
 *    机构引用不在本备份里、有数据属于另一个档案、ID 重复。
 *
 * 第三类是真正的价值所在：单看每一行都合法、合到一起却对不上的备份，
 * 恢复时才会炸，而那时用户的原始数据可能已经没有了（任务书第六、十节）。
 */
export function validateBackupDocument(value: unknown): BackupValidationResult {
  const issues: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: ['备份不是一个对象'] };
  }

  if (value.format !== BACKUP_FORMAT) {
    issues.push(`format 应为 ${BACKUP_FORMAT}`);
  }
  if (typeof value.formatVersion !== 'number' || !SUPPORTED_FORMAT_VERSIONS.includes(value.formatVersion)) {
    issues.push('formatVersion 不是当前支持的版本');
  }
  checkField(issues, 'exportedAt', 'timestamp', value.exportedAt);
  if (!isPositiveInteger(value.databaseSchemaVersion)) {
    issues.push('databaseSchemaVersion 不是正整数');
  }

  const profile = value.profile;
  if (!isRecord(profile)) {
    issues.push('缺少 profile');
  } else {
    checkRow(issues, 'profile', PROFILE_SPEC, profile);
  }

  const institutions = takeArray(issues, 'institutions', value.institutions);
  const purchases = takeArray(issues, 'purchases', value.purchases);
  const purchaseItems = takeArray(issues, 'purchaseItems', value.purchaseItems);
  const redemptionRecords = takeArray(issues, 'redemptionRecords', value.redemptionRecords);
  const wishlistItems = takeArray(issues, 'wishlistItems', value.wishlistItems);
  const catalogFavorites = takeArray(issues, 'catalogFavorites', value.catalogFavorites);

  checkRows(issues, 'institutions', INSTITUTION_SPEC, institutions);
  checkRows(issues, 'purchases', PURCHASE_SPEC, purchases);
  checkRows(issues, 'purchaseItems', PURCHASE_ITEM_SPEC, purchaseItems);
  checkRows(issues, 'redemptionRecords', REDEMPTION_SPEC, redemptionRecords);
  checkRows(issues, 'wishlistItems', WISHLIST_SPEC, wishlistItems);
  checkRows(issues, 'catalogFavorites', FAVORITE_SPEC, catalogFavorites);

  // 前面任何一项不过关时就不再查引用关系：在一堆类型错误上继续推导归属，
  // 只会把同一个问题换着说法再报十遍。
  if (issues.length > 0) {
    return fail(issues);
  }

  const document = value as unknown as BackupDocument;
  checkConsistency(issues, document);

  return issues.length === 0 ? { ok: true } : fail(issues);
}

/** 内部引用与业务不变量。此时每一行的字段类型都已确认合法。 */
function checkConsistency(issues: string[], document: BackupDocument): void {
  const profileId = document.profile.id;

  const institutionIds = collectIds(issues, 'institutions', document.institutions);
  const purchaseIds = collectIds(issues, 'purchases', document.purchases);
  const itemIds = collectIds(issues, 'purchaseItems', document.purchaseItems);
  collectIds(issues, 'redemptionRecords', document.redemptionRecords);
  collectIds(issues, 'wishlistItems', document.wishlistItems);

  const favoriteKeys = new Set<string>();
  document.catalogFavorites.forEach((favorite, index) => {
    if (favoriteKeys.has(favorite.article_slug)) {
      issues.push(`catalogFavorites[${index}] 收藏重复：${favorite.article_slug}`);
    }
    favoriteKeys.add(favorite.article_slug);
  });

  // 档案隔离：备份里不允许出现任何属于另一个档案的行（任务书第六节）。
  checkOwner(issues, 'institutions', profileId, document.institutions);
  checkOwner(issues, 'purchases', profileId, document.purchases);
  checkOwner(issues, 'wishlistItems', profileId, document.wishlistItems);
  checkOwner(issues, 'catalogFavorites', profileId, document.catalogFavorites);

  document.purchaseItems.forEach((item, index) => {
    if (!purchaseIds.has(item.purchase_id)) {
      issues.push(`purchaseItems[${index}] 指向不存在的套餐`);
    }
    if (item.quantity < 1) {
      issues.push(`purchaseItems[${index}].quantity 小于 1`);
    }
    if (item.unit_amount_minor < 0) {
      issues.push(`purchaseItems[${index}].unit_amount_minor 为负`);
    }
  });

  document.purchases.forEach((purchase, index) => {
    if (purchase.total_amount_minor < 0) {
      issues.push(`purchases[${index}].total_amount_minor 为负`);
    }
    checkInstitutionRef(issues, `purchases[${index}]`, institutionIds, purchase.institution_id);
  });

  document.redemptionRecords.forEach((record, index) => {
    if (!itemIds.has(record.purchase_item_id)) {
      issues.push(`redemptionRecords[${index}] 指向不存在的套餐项目`);
    }
    // 与表级 CHECK 约束同一口径：撤销必须留下时间，有效记录不能带撤销时间。
    if (record.status === 'void' && record.voided_at === null) {
      issues.push(`redemptionRecords[${index}] 已撤销但缺少撤销时间`);
    }
    if (record.status === 'active' && record.voided_at !== null) {
      issues.push(`redemptionRecords[${index}] 有效却带着撤销时间`);
    }
    checkInstitutionRef(issues, `redemptionRecords[${index}]`, institutionIds, record.institution_id);
  });

  document.wishlistItems.forEach((wish, index) => {
    if (wish.budget_minor !== null && wish.budget_minor < 0) {
      issues.push(`wishlistItems[${index}].budget_minor 为负`);
    }
    checkInstitutionRef(issues, `wishlistItems[${index}]`, institutionIds, wish.institution_id);
  });
}

function checkInstitutionRef(
  issues: string[],
  path: string,
  institutionIds: ReadonlySet<string>,
  institutionId: string | null,
): void {
  if (institutionId !== null && !institutionIds.has(institutionId)) {
    issues.push(`${path} 引用的机构不在本备份中`);
  }
}

function checkOwner(
  issues: string[],
  path: string,
  profileId: string,
  rows: readonly { readonly profile_id: string }[],
): void {
  rows.forEach((row, index) => {
    if (row.profile_id !== profileId) {
      issues.push(`${path}[${index}] 属于另一个档案`);
    }
  });
}

function collectIds(
  issues: string[],
  path: string,
  rows: readonly { readonly id: string }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.id)) {
      issues.push(`${path}[${index}] 的 ID 重复`);
    }
    ids.add(row.id);
  });
  return ids;
}

function takeArray(issues: string[], path: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} 缺失或不是数组`);
    return [];
  }
  return value;
}

function checkRows(issues: string[], path: string, spec: RowSpec, rows: readonly unknown[]): void {
  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      issues.push(`${path}[${index}] 不是一个对象`);
      return;
    }
    checkRow(issues, `${path}[${index}]`, spec, row);
  });
}

function checkRow(
  issues: string[],
  path: string,
  spec: RowSpec,
  row: Readonly<Record<string, unknown>>,
): void {
  for (const [field, kind] of Object.entries(spec)) {
    if (!(field in row)) {
      issues.push(`${path} 缺少字段 ${field}`);
      continue;
    }
    checkField(issues, `${path}.${field}`, kind, row[field]);
  }
}

function checkField(issues: string[], path: string, kind: FieldKind, value: unknown): void {
  // `undefined` 单独说一句：它是 JSON 里根本不存在的值，出现就说明组装环节漏了。
  if (value === undefined) {
    issues.push(`${path} 为 undefined`);
    return;
  }
  if (isNullable(kind) && value === null) {
    return;
  }
  if (!isValidValue(kind, value)) {
    issues.push(`${path} 的取值不符合 ${kind}`);
  }
}

function isValidValue(kind: FieldKind, value: unknown): boolean {
  switch (kind) {
    case 'id':
      return typeof value === 'string' && value.length > 0;
    case 'text':
    case 'nullableText':
      return typeof value === 'string';
    case 'integer':
    case 'nullableInteger':
      return Number.isInteger(value);
    case 'flag':
      return value === 0 || value === 1;
    case 'date':
    case 'nullableDate':
      return typeof value === 'string' && BUSINESS_DATE_PATTERN.test(value);
    case 'timestamp':
    case 'nullableTimestamp':
      return isTimestamp(value);
    case 'category':
    case 'nullableCategory':
      return (
        typeof value === 'string' &&
        (PURCHASE_ITEM_CATEGORIES as readonly string[]).includes(value)
      );
    case 'status':
      return typeof value === 'string' && (REDEMPTION_STATUSES as readonly string[]).includes(value);
  }
}

function isNullable(kind: FieldKind): boolean {
  return kind.startsWith('nullable');
}

function isTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(issues: readonly string[]): BackupValidationResult {
  if (issues.length <= MAX_ISSUES) {
    return { ok: false, issues };
  }
  return {
    ok: false,
    issues: [...issues.slice(0, MAX_ISSUES), `另有 ${issues.length - MAX_ISSUES} 项问题未列出`],
  };
}
