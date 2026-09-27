import {
  LATEST_SCHEMA_VERSION,
  PERSON_STATUSES,
  PURCHASE_ITEM_CATEGORIES,
  PURCHASE_KINDS,
  REDEMPTION_STATUSES,
  USAGE_SOURCE_KINDS,
  USAGE_STATUSES,
} from '@/db';
import { compareBusinessDates, isBusinessDate } from '@/utils/business-date';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_V2_SCHEMA_VERSION,
  LEGACY_BACKUP_FORMAT_VERSION,
  type BackupDocument,
  type BackupDocumentV1,
} from '../backup-document';

/**
 * 校验失败的性质。
 *
 * 三者对用户是三句不同的话，也对应三种不同的下一步：
 *
 * - `notBackup`：这根本不是本 App 的备份——用户多半在文件列表里点错了，
 *   该去挑另一个文件。
 * - `invalid`：确实是本 App 的备份，但内容坏了或内部对不上——换文件也许有用，
 *   这一份是救不回来的。
 * - `incompatible`：是本 App 的备份，内容也可能完好，但来自更新的版本——
 *   换文件没用，要等 App 更新。这种情况**一律整份拒绝**，不做「尽力恢复」：
 *   读不懂的字段可能正是决定数据含义的那个（任务书第五节）。
 */
export type BackupValidationFailureKind = 'notBackup' | 'invalid' | 'incompatible';

/**
 * 备份自检的结果。
 *
 * `issues` 是**技术性**说明，只用于 `__DEV__` 日志与自动化验证，
 * 永远不会展示给用户：用户看到的是第九节规定的那几句中文（任务书第九节）。
 * 它只描述「哪个位置的什么规则没过」，不回显字段取值，因此不会把用户的
 * 备注、机构名称、人名泄进日志。
 */
export type BackupValidationFailure = {
  readonly ok: false;
  readonly kind: BackupValidationFailureKind;
  readonly issues: readonly string[];
};

export type BackupValidationResult = { readonly ok: true } | BackupValidationFailure;

/**
 * 分派校验的结果：通过时带上格式版本，调用方据此决定是否先把 v1 转换为 v2。
 */
export type BackupEnvelopeValidationResult =
  | { readonly ok: true; readonly formatVersion: 1 | 2 }
  | BackupValidationFailure;

/** 问题列表的上限。一份结构彻底不对的文件会产生成千上万条，记那么多没有意义。 */
const MAX_ISSUES = 20;

/** 格式 1 允许出现的顶层键。多一个都不接受，见 `checkUnknownKeys`。 */
const DOCUMENT_KEYS_V1: readonly string[] = [
  'format',
  'formatVersion',
  'exportedAt',
  'databaseSchemaVersion',
  'profile',
  'institutions',
  'purchases',
  'purchaseItems',
  'redemptionRecords',
  'wishlistItems',
  'catalogFavorites',
];

/** 格式 2 允许出现的顶层键（DATA_MODEL_V4 第 11.2 节）。 */
const DOCUMENT_KEYS_V2: readonly string[] = [
  'format',
  'formatVersion',
  'exportedAt',
  'databaseSchemaVersion',
  'profile',
  'people',
  'institutions',
  'purchases',
  'purchaseItems',
  'beautyEvents',
  'usageRecords',
  'wishlistItems',
  'catalogFavorites',
];

/** 币种是定长三字母代码（表级 CHECK：`length(currency) = 3`）。 */
const CURRENCY_LENGTH = 3;

type FieldKind =
  /** 非空字符串，用于主键、外键与必填的目录代码。 */
  | 'id'
  /** 去除首尾空格后非空的文本，对应表上的 `length(trim(...)) > 0`。 */
  | 'name'
  | 'currency'
  | 'text'
  | 'nullableText'
  /** `null` 或非空字符串，对应 `x IS NULL OR length(x) > 0`；用于目录代码。 */
  | 'nullableCode'
  /** `null` 或去除首尾空格后非空的文本。 */
  | 'nullableName'
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
  | 'redemptionStatus'
  | 'purchaseKind'
  | 'personStatus'
  | 'sourceKind'
  | 'usageStatus';

type RowSpec = Readonly<Record<string, FieldKind>>;

const PROFILE_SPEC: RowSpec = {
  id: 'id',
  display_name: 'name',
  is_default: 'flag',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const WISHLIST_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  name: 'name',
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
  article_slug: 'name',
  created_at: 'timestamp',
};

// ---------------------------------------------------------------------------
// 格式 1（schema v3）
// ---------------------------------------------------------------------------

const INSTITUTION_SPEC_V1: RowSpec = {
  id: 'id',
  profile_id: 'id',
  name: 'name',
  normalized_name: 'name',
  city: 'nullableText',
  notes: 'nullableText',
  is_archived: 'flag',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const PURCHASE_SPEC_V1: RowSpec = {
  id: 'id',
  profile_id: 'id',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  city_snapshot: 'nullableText',
  name: 'name',
  purchase_date: 'date',
  total_amount_minor: 'integer',
  currency: 'currency',
  expires_on: 'nullableDate',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const PURCHASE_ITEM_SPEC_V1: RowSpec = {
  id: 'id',
  purchase_id: 'id',
  name: 'name',
  category: 'category',
  quantity: 'integer',
  unit_amount_minor: 'integer',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const REDEMPTION_SPEC_V1: RowSpec = {
  id: 'id',
  purchase_item_id: 'id',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  city_snapshot: 'nullableText',
  redeemed_on: 'date',
  status: 'redemptionStatus',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
  voided_at: 'nullableTimestamp',
  void_reason: 'nullableText',
};

// ---------------------------------------------------------------------------
// 格式 2（schema v4，DATA_MODEL_V4 第 4、11 节）
// ---------------------------------------------------------------------------

const PERSON_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  display_name: 'name',
  normalized_name: 'id',
  is_self: 'flag',
  status: 'personStatus',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const INSTITUTION_SPEC_V2: RowSpec = {
  ...INSTITUTION_SPEC_V1,
  province_code: 'nullableCode',
  province_name: 'nullableName',
  city_code: 'nullableCode',
};

const PURCHASE_SPEC_V2: RowSpec = {
  id: 'id',
  profile_id: 'id',
  purchase_kind: 'purchaseKind',
  purchaser_person_id: 'id',
  purchaser_name_snapshot: 'name',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  city_snapshot: 'nullableText',
  name: 'name',
  purchase_date: 'date',
  total_amount_minor: 'integer',
  currency: 'currency',
  expires_on: 'nullableDate',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const PURCHASE_ITEM_SPEC_V2: RowSpec = {
  id: 'id',
  purchase_id: 'id',
  name: 'name',
  category_code: 'id',
  service_code: 'nullableCode',
  custom_name: 'nullableName',
  quantity: 'integer',
  allocated_amount_minor: 'integer',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const EVENT_SPEC: RowSpec = {
  id: 'id',
  profile_id: 'id',
  occurred_on: 'date',
  institution_id: 'nullableText',
  institution_name_snapshot: 'nullableText',
  province_code_snapshot: 'nullableCode',
  province_name_snapshot: 'nullableText',
  city_code_snapshot: 'nullableCode',
  city_name_snapshot: 'nullableText',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

const USAGE_SPEC: RowSpec = {
  id: 'id',
  event_id: 'id',
  source_kind: 'sourceKind',
  purchase_item_id: 'nullableText',
  person_id: 'id',
  person_name_snapshot: 'name',
  category_code_snapshot: 'id',
  service_code_snapshot: 'nullableCode',
  service_name_snapshot: 'nullableText',
  custom_name_snapshot: 'nullableText',
  purchase_name_snapshot: 'nullableText',
  purchase_item_name_snapshot: 'nullableText',
  status: 'usageStatus',
  voided_at: 'nullableTimestamp',
  void_reason: 'nullableText',
  notes: 'nullableText',
  created_at: 'timestamp',
  updated_at: 'timestamp',
};

/** 来源必须关联购买项目的两种 `source_kind`（DATA_MODEL_V4 第 5.1 节）。 */
const ITEM_SOURCE_KINDS: readonly string[] = ['package_item', 'single_purchase'];

/** 必须带套餐与套餐项目名称快照的 `source_kind`（DATA_MODEL_V4 第 4.6 节）。 */
const SNAPSHOT_SOURCE_KINDS: readonly string[] = [...ITEM_SOURCE_KINDS, 'deleted_package'];

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

/**
 * 校验一份备份是否结构完整、内部自洽、且本版本读得懂。
 *
 * 纯函数：只看传进来的值，不读数据库、不读时钟、不读文件系统，
 * 因此导出前、恢复前都能跑同一份逻辑，自动化验证里也能直接喂构造出来的坏数据。
 * **导出与恢复共用这一套校验器**，不存在第二套会各自漂移的规则（任务书第五节）。
 *
 * 它检查四类东西：
 *
 * 1. **信封**——`format` 对不对、`formatVersion` 认不认识、元数据齐不齐。
 * 2. **兼容性**——文件是否来自更新的格式版本或更新的数据库 schema。
 * 3. **每一行的字段**——缺字段、多字段、类型错、日期不存在、枚举越界、布尔不是 0/1。
 * 4. **内部引用与业务不变量**——项目挂在不存在的套餐上、使用记录引用不存在的项目、
 *    机构引用不在本备份里、有数据属于另一个档案、ID 重复、判重键撞车。
 *
 * 第四类是真正的价值所在：单看每一行都合法、合到一起却对不上的备份，
 * 恢复时才会炸，而那时用户的原始数据可能已经没有了（任务书第六、十节）。
 *
 * 本函数按 `formatVersion` 分派：1 走 v1 规则（通过后由调用方转换为 v2 再校验一次），
 * 2 走 v2 规则。其余取值一律不接受。
 *
 * 需要强调的是这里**不看任何外部状态**：恢复事务内还会再确认一次数据库版本，
 * 因为库有可能在用户挑文件的这段时间里被另一条路径动过。
 */
export function validateBackupDocument(value: unknown): BackupEnvelopeValidationResult {
  if (!isRecord(value)) {
    return fail(['备份不是一个对象'], 'notBackup');
  }

  if (value.format !== BACKUP_FORMAT) {
    // 连格式标识都不对，多半根本不是本 App 的备份。继续逐字段挑错只会
    // 刷出几十条噪音，把「你选错文件了」这个真正的结论埋掉。
    return fail([`format 应为 ${BACKUP_FORMAT}`], 'notBackup');
  }

  // 兼容性先判，且判到就直接返回：对一份本版本读不懂的备份逐字段挑错没有意义，
  // 「尽力解析」正是任务书明令禁止的做法（任务书第五节）。
  const incompatibilities = checkCompatibility(value);
  if (incompatibilities.length > 0) {
    return fail(incompatibilities, 'incompatible');
  }

  if (value.formatVersion === LEGACY_BACKUP_FORMAT_VERSION) {
    const result = validateV1(value);
    return result.ok ? { ok: true, formatVersion: 1 } : result;
  }
  if (value.formatVersion === BACKUP_FORMAT_VERSION) {
    const result = validateV2(value);
    return result.ok ? { ok: true, formatVersion: 2 } : result;
  }
  return fail(['formatVersion 不是当前支持的版本'], 'invalid');
}

/**
 * 只按格式 2 的规则校验。
 *
 * 用于两处：导出前的自检，以及 v1 → v2 转换之后的复检（DATA_MODEL_V4 第 11.3 节）。
 * 格式 1 的文档在这里一律是 `invalid`：到这一步的文档必须已经是 v2。
 */
export function validateBackupDocumentV2(value: unknown): BackupValidationResult {
  if (!isRecord(value)) {
    return fail(['备份不是一个对象'], 'notBackup');
  }
  if (value.format !== BACKUP_FORMAT) {
    return fail([`format 应为 ${BACKUP_FORMAT}`], 'notBackup');
  }
  const incompatibilities = checkCompatibility(value);
  if (incompatibilities.length > 0) {
    return fail(incompatibilities, 'incompatible');
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    return fail(['formatVersion 不是 2'], 'invalid');
  }
  return validateV2(value);
}

/**
 * 版本兼容性。
 *
 * 两个版本号回答两个不同的问题，不能互相替代，也不能互相推导：
 *
 * - `formatVersion` 说的是**备份文件自己的字段结构**，决定这段 JSON 该怎么读；
 * - `databaseSchemaVersion` 说的是**导出当时本地数据库的结构**，决定这些行能不能写回来。
 *
 * 一个来自更高 schema 的备份可能带着本地还没有的表或列，写回去要么丢数据、
 * 要么撞上不存在的约束。这时正确的做法是拒绝，而不是按当前认识挑着恢复。
 * 反过来，schema 比本地**低**是允许的：格式 1 的旧备份会先转换为格式 2。
 *
 * 这里绝不会因为文件里写了什么就去改 `PRAGMA user_version`：备份是数据，
 * 不是 migration（任务书第三、五节）。
 */
function checkCompatibility(value: Readonly<Record<string, unknown>>): string[] {
  const issues: string[] = [];
  if (Number.isInteger(value.formatVersion) && (value.formatVersion as number) > BACKUP_FORMAT_VERSION) {
    issues.push('formatVersion 高于本版本能读懂的备份格式');
  }
  if (
    Number.isInteger(value.databaseSchemaVersion) &&
    (value.databaseSchemaVersion as number) > LATEST_SCHEMA_VERSION
  ) {
    issues.push('databaseSchemaVersion 高于本地数据库版本');
  }
  return issues;
}

/** 信封里除版本号以外的元数据：导出时间、schema 版本、顶层键集合与档案行。 */
function checkEnvelope(
  issues: string[],
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  checkField(issues, 'exportedAt', 'timestamp', value.exportedAt);
  if (!isPositiveInteger(value.databaseSchemaVersion)) {
    issues.push('databaseSchemaVersion 不是正整数');
  }
  checkUnknownKeys(issues, '备份', keys, value);

  const profile = value.profile;
  if (!isRecord(profile)) {
    issues.push('缺少 profile');
  } else {
    checkRow(issues, 'profile', PROFILE_SPEC, profile);
  }
}

// ---------------------------------------------------------------------------
// 格式 1
// ---------------------------------------------------------------------------

function validateV1(value: Readonly<Record<string, unknown>>): BackupValidationResult {
  const issues: string[] = [];
  checkEnvelope(issues, value, DOCUMENT_KEYS_V1);

  // 格式 1 只可能由 schema v1–v3 导出。写着 v4 以上的格式 1 文件对不上任何
  // 真实导出，只能是被改过或组装错了。
  if (isPositiveInteger(value.databaseSchemaVersion) && (value.databaseSchemaVersion as number) >= BACKUP_V2_SCHEMA_VERSION) {
    issues.push('格式 1 的 databaseSchemaVersion 应低于 4');
  }

  const institutions = takeArray(issues, 'institutions', value.institutions);
  const purchases = takeArray(issues, 'purchases', value.purchases);
  const purchaseItems = takeArray(issues, 'purchaseItems', value.purchaseItems);
  const redemptionRecords = takeArray(issues, 'redemptionRecords', value.redemptionRecords);
  const wishlistItems = takeArray(issues, 'wishlistItems', value.wishlistItems);
  const catalogFavorites = takeArray(issues, 'catalogFavorites', value.catalogFavorites);

  checkRows(issues, 'institutions', INSTITUTION_SPEC_V1, institutions);
  checkRows(issues, 'purchases', PURCHASE_SPEC_V1, purchases);
  checkRows(issues, 'purchaseItems', PURCHASE_ITEM_SPEC_V1, purchaseItems);
  checkRows(issues, 'redemptionRecords', REDEMPTION_SPEC_V1, redemptionRecords);
  checkRows(issues, 'wishlistItems', WISHLIST_SPEC, wishlistItems);
  checkRows(issues, 'catalogFavorites', FAVORITE_SPEC, catalogFavorites);

  // 前面任何一项不过关时就不再查引用关系：在一堆类型错误上继续推导归属，
  // 只会把同一个问题换着说法再报十遍。
  if (issues.length > 0) {
    return fail(issues, 'invalid');
  }

  checkConsistencyV1(issues, value as unknown as BackupDocumentV1);
  return issues.length === 0 ? { ok: true } : fail(issues, 'invalid');
}

/** 格式 1 的内部引用与业务不变量。此时每一行的字段类型都已确认合法。 */
function checkConsistencyV1(issues: string[], document: BackupDocumentV1): void {
  const profileId = document.profile.id;
  checkProfileAndFavorites(issues, document.profile.is_default, document.catalogFavorites);

  const institutionIds = collectIds(issues, 'institutions', document.institutions);
  const purchaseIds = collectIds(issues, 'purchases', document.purchases);
  const itemIds = collectIds(issues, 'purchaseItems', document.purchaseItems);
  collectIds(issues, 'redemptionRecords', document.redemptionRecords);
  collectIds(issues, 'wishlistItems', document.wishlistItems);

  // 档案隔离：备份里不允许出现任何属于另一个档案的行（任务书第六节）。
  checkOwner(issues, 'institutions', profileId, document.institutions);
  checkOwner(issues, 'purchases', profileId, document.purchases);
  checkOwner(issues, 'wishlistItems', profileId, document.wishlistItems);
  checkOwner(issues, 'catalogFavorites', profileId, document.catalogFavorites);

  checkInstitutionNames(issues, document.institutions);

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
    checkPurchaseBasics(issues, `purchases[${index}]`, purchase, institutionIds);
  });

  document.redemptionRecords.forEach((record, index) => {
    if (!itemIds.has(record.purchase_item_id)) {
      issues.push(`redemptionRecords[${index}] 指向不存在的套餐项目`);
    }
    checkVoidFields(issues, `redemptionRecords[${index}]`, record);
    checkInstitutionRef(issues, `redemptionRecords[${index}]`, institutionIds, record.institution_id);
  });

  checkWishlist(issues, document.wishlistItems, institutionIds);
}

// ---------------------------------------------------------------------------
// 格式 2
// ---------------------------------------------------------------------------

function validateV2(value: Readonly<Record<string, unknown>>): BackupValidationResult {
  const issues: string[] = [];
  checkEnvelope(issues, value, DOCUMENT_KEYS_V2);

  // 格式 2 的结构就是 schema v4 的结构，不可能由更早的数据库导出。
  if (isPositiveInteger(value.databaseSchemaVersion) && (value.databaseSchemaVersion as number) < BACKUP_V2_SCHEMA_VERSION) {
    issues.push('格式 2 的 databaseSchemaVersion 不应低于 4');
  }

  const people = takeArray(issues, 'people', value.people);
  const institutions = takeArray(issues, 'institutions', value.institutions);
  const purchases = takeArray(issues, 'purchases', value.purchases);
  const purchaseItems = takeArray(issues, 'purchaseItems', value.purchaseItems);
  const beautyEvents = takeArray(issues, 'beautyEvents', value.beautyEvents);
  const usageRecords = takeArray(issues, 'usageRecords', value.usageRecords);
  const wishlistItems = takeArray(issues, 'wishlistItems', value.wishlistItems);
  const catalogFavorites = takeArray(issues, 'catalogFavorites', value.catalogFavorites);

  checkRows(issues, 'people', PERSON_SPEC, people);
  checkRows(issues, 'institutions', INSTITUTION_SPEC_V2, institutions);
  checkRows(issues, 'purchases', PURCHASE_SPEC_V2, purchases);
  checkRows(issues, 'purchaseItems', PURCHASE_ITEM_SPEC_V2, purchaseItems);
  checkRows(issues, 'beautyEvents', EVENT_SPEC, beautyEvents);
  checkRows(issues, 'usageRecords', USAGE_SPEC, usageRecords);
  checkRows(issues, 'wishlistItems', WISHLIST_SPEC, wishlistItems);
  checkRows(issues, 'catalogFavorites', FAVORITE_SPEC, catalogFavorites);

  if (issues.length > 0) {
    return fail(issues, 'invalid');
  }

  checkConsistencyV2(issues, value as unknown as BackupDocument);
  return issues.length === 0 ? { ok: true } : fail(issues, 'invalid');
}

/**
 * 格式 2 的内部引用与业务不变量（DATA_MODEL_V4 第 11.4 节）。
 *
 * 数据库里的外键在原生独占事务中是关闭的，恢复时不能指望它们兜底；
 * 这里与恢复事务内的自查一起，把表级 CHECK 与外键的口径各守一遍。
 */
function checkConsistencyV2(issues: string[], document: BackupDocument): void {
  const profileId = document.profile.id;
  checkProfileAndFavorites(issues, document.profile.is_default, document.catalogFavorites);

  const personIds = collectIds(issues, 'people', document.people);
  const institutionIds = collectIds(issues, 'institutions', document.institutions);
  collectIds(issues, 'purchases', document.purchases);
  collectIds(issues, 'purchaseItems', document.purchaseItems);
  const eventIds = collectIds(issues, 'beautyEvents', document.beautyEvents);
  collectIds(issues, 'usageRecords', document.usageRecords);
  collectIds(issues, 'wishlistItems', document.wishlistItems);

  checkOwner(issues, 'people', profileId, document.people);
  checkOwner(issues, 'institutions', profileId, document.institutions);
  checkOwner(issues, 'purchases', profileId, document.purchases);
  checkOwner(issues, 'beautyEvents', profileId, document.beautyEvents);
  checkOwner(issues, 'wishlistItems', profileId, document.wishlistItems);
  checkOwner(issues, 'catalogFavorites', profileId, document.catalogFavorites);

  // 人：恰好一个「自己」且在使用中；判重键在档案内唯一（表上有唯一索引）。
  const selves = document.people.filter((person) => person.is_self === 1);
  if (selves.length !== 1) {
    issues.push(`people 中「自己」的数量为 ${selves.length}，应为 1`);
  }
  document.people.forEach((person, index) => {
    if (person.is_self === 1 && person.status !== 'active') {
      issues.push(`people[${index}] 是「自己」却不在使用中`);
    }
  });
  const personNames = new Set<string>();
  document.people.forEach((person, index) => {
    if (personNames.has(person.normalized_name)) {
      issues.push(`people[${index}] 与另一个人判重键相同`);
    }
    personNames.add(person.normalized_name);
  });

  checkInstitutionNames(issues, document.institutions);

  // 机构地点只允许 A（全空）、B（省）、C（省 + 市）三种组合（DATA_MODEL_V4 第 4.7 节）。
  document.institutions.forEach((institution, index) => {
    const path = `institutions[${index}]`;
    const hasProvinceCode = institution.province_code !== null;
    const hasProvinceName = institution.province_name !== null;
    if (hasProvinceCode !== hasProvinceName) {
      issues.push(`${path} 省代码与省名称没有成对出现`);
    }
    if (institution.city_code !== null && !(hasProvinceCode && hasProvinceName)) {
      issues.push(`${path} 有城市代码却缺少省代码或省名称`);
    }
    if (
      (hasProvinceCode || institution.city_code !== null) &&
      (institution.city === null || institution.city.trim().length === 0)
    ) {
      issues.push(`${path} 有地点代码却没有城市文字`);
    }
  });

  const purchasesById = new Map(document.purchases.map((purchase) => [purchase.id, purchase]));
  const itemsById = new Map(document.purchaseItems.map((item) => [item.id, item]));
  const eventsById = new Map(document.beautyEvents.map((event) => [event.id, event]));
  const peopleById = new Map(document.people.map((person) => [person.id, person]));

  const itemCountByPurchase = new Map<string, number>();
  document.purchaseItems.forEach((item, index) => {
    const path = `purchaseItems[${index}]`;
    if (!purchasesById.has(item.purchase_id)) {
      issues.push(`${path} 指向不存在的套餐`);
    }
    itemCountByPurchase.set(item.purchase_id, (itemCountByPurchase.get(item.purchase_id) ?? 0) + 1);
    if (item.quantity < 1) {
      issues.push(`${path}.quantity 小于 1`);
    }
    if (item.allocated_amount_minor < 0) {
      issues.push(`${path}.allocated_amount_minor 为负`);
    }
    if (item.service_code === null && item.custom_name === null) {
      issues.push(`${path} 既没有目录代码也没有自定义名称`);
    }
  });

  document.purchases.forEach((purchase, index) => {
    const path = `purchases[${index}]`;
    checkPurchaseBasics(issues, path, purchase, institutionIds);
    if (!personIds.has(purchase.purchaser_person_id)) {
      issues.push(`${path} 的购买人不在本备份中`);
    }
    if (purchase.purchase_kind === 'single') {
      // 单次购买恰好一个项目、购买次数 1（PRD 第 5B.8 节）。
      const items = document.purchaseItems.filter((item) => item.purchase_id === purchase.id);
      if (items.length !== 1 || items[0].quantity !== 1) {
        issues.push(`${path} 是单次购买，却不是恰好一个次数为 1 的项目`);
      }
    }
  });

  document.beautyEvents.forEach((event, index) => {
    const path = `beautyEvents[${index}]`;
    checkInstitutionRef(issues, path, institutionIds, event.institution_id);
    // 与表级 CHECK 同一口径（DATA_MODEL_V4 第 4.5 节）。
    if ((event.province_code_snapshot === null) !== (event.province_name_snapshot === null)) {
      issues.push(`${path} 省代码快照与省名称快照没有成对出现`);
    }
    if (
      event.city_code_snapshot !== null &&
      (event.province_code_snapshot === null || event.city_name_snapshot === null)
    ) {
      issues.push(`${path} 有城市代码快照却缺少省代码或城市名称快照`);
    }
  });

  document.usageRecords.forEach((usage, index) => {
    const path = `usageRecords[${index}]`;
    const event = eventsById.get(usage.event_id);
    const person = peopleById.get(usage.person_id);
    if (!eventIds.has(usage.event_id)) {
      issues.push(`${path} 指向不存在的变美记录`);
    }
    if (person === undefined) {
      issues.push(`${path} 的使用人不在本备份中`);
    }

    const needsItem = ITEM_SOURCE_KINDS.includes(usage.source_kind);
    if (needsItem && usage.purchase_item_id === null) {
      issues.push(`${path} 来源需要关联购买项目却没有关联`);
    }
    if (!needsItem && usage.purchase_item_id !== null) {
      issues.push(`${path} 来源不应关联购买项目却关联了`);
    }

    if (usage.purchase_item_id !== null) {
      const item = itemsById.get(usage.purchase_item_id);
      const purchase = item === undefined ? undefined : purchasesById.get(item.purchase_id);
      if (item === undefined) {
        issues.push(`${path} 指向不存在的购买项目`);
      } else if (purchase !== undefined) {
        const expected = purchase.purchase_kind === 'single' ? 'single_purchase' : 'package_item';
        if (needsItem && usage.source_kind !== expected) {
          issues.push(`${path} 的来源与所关联购买的类型不一致`);
        }
        if (event !== undefined && purchase.profile_id !== event.profile_id) {
          issues.push(`${path} 的来源购买与变美记录不属于同一档案`);
        }
      }
    }
    if (event !== undefined && person !== undefined && person.profile_id !== event.profile_id) {
      issues.push(`${path} 的使用人与变美记录不属于同一档案`);
    }

    // 与表级 CHECK 同一口径（DATA_MODEL_V4 第 4.6 节）。
    if (usage.status === 'active' && (usage.voided_at !== null || usage.void_reason !== null)) {
      issues.push(`${path} 有效却带着撤销时间或撤销原因`);
    }
    if (usage.status === 'void' && usage.voided_at === null) {
      issues.push(`${path} 已撤销但缺少撤销时间`);
    }
    if (usage.service_code_snapshot !== null && usage.service_name_snapshot === null) {
      issues.push(`${path} 有目录代码快照却没有目录名称快照`);
    }
    if (usage.service_code_snapshot === null && usage.custom_name_snapshot === null) {
      issues.push(`${path} 既没有目录代码快照也没有自定义名称快照`);
    }
    // 来源为套餐、单次购买或原套餐已删除时，套餐与套餐项目名称快照必须在：
    // 套餐删除后它们是这条记录与原套餐之间唯一的线索（DATA_MODEL_V4 第 4.6 节）。
    if (
      SNAPSHOT_SOURCE_KINDS.includes(usage.source_kind) &&
      (isBlank(usage.purchase_name_snapshot) || isBlank(usage.purchase_item_name_snapshot))
    ) {
      issues.push(`${path} 缺少套餐或套餐项目名称快照`);
    }
  });

  // 这里刻意不检查「有效使用次数不超过购买次数」：历史数据（v3 核销、v1 备份）
  // 可能已经超用，迁移与恢复都必须原样保留（DATA_MODEL_V4 第 11.4 节）。
  // 阻止**新增**超用是写入路径的职责，备份只校验结构与引用。

  checkWishlist(issues, document.wishlistItems, institutionIds);
}

// ---------------------------------------------------------------------------
// 两个格式共用的规则
// ---------------------------------------------------------------------------

function checkProfileAndFavorites(
  issues: string[],
  isDefault: number,
  favorites: readonly { readonly article_slug: string }[],
): void {
  // 档案必须是默认档案。第一版全 App 只有一个可用档案（ADR-015），恢复一个
  // `is_default = 0` 的档案会让用户进到一个哪儿都读不到数据的 App。
  if (isDefault !== 1) {
    issues.push('profile.is_default 不是 1');
  }

  const favoriteKeys = new Set<string>();
  favorites.forEach((favorite, index) => {
    if (favoriteKeys.has(favorite.article_slug)) {
      issues.push(`catalogFavorites[${index}] 收藏重复`);
    }
    favoriteKeys.add(favorite.article_slug);
  });
}

/**
 * 机构判重键。库里没有唯一索引，判重靠业务层（PRD 第 5A.3.2 节），
 * 因此备份里撞车的两个机构写得进去，却会让此后每一次改名、恢复归档
 * 都撞上「已存在同名机构」而无法保存。在恢复之前拦下。
 */
function checkInstitutionNames(
  issues: string[],
  institutions: readonly { readonly normalized_name: string }[],
): void {
  const normalizedNames = new Set<string>();
  institutions.forEach((institution, index) => {
    if (normalizedNames.has(institution.normalized_name)) {
      issues.push(`institutions[${index}] 与另一个机构判重键相同`);
    }
    normalizedNames.add(institution.normalized_name);
  });
}

function checkPurchaseBasics(
  issues: string[],
  path: string,
  purchase: {
    readonly total_amount_minor: number;
    readonly purchase_date: string;
    readonly expires_on: string | null;
    readonly institution_id: string | null;
  },
  institutionIds: ReadonlySet<string>,
): void {
  if (purchase.total_amount_minor < 0) {
    issues.push(`${path}.total_amount_minor 为负`);
  }
  // 与表级 CHECK 同一口径：有效期不得早于购买日期（PRD 第 6.4 节）。
  if (purchase.expires_on !== null && compareBusinessDates(purchase.expires_on, purchase.purchase_date) < 0) {
    issues.push(`${path}.expires_on 早于购买日期`);
  }
  checkInstitutionRef(issues, path, institutionIds, purchase.institution_id);
}

function checkVoidFields(
  issues: string[],
  path: string,
  record: { readonly status: string; readonly voided_at: string | null; readonly void_reason: string | null },
): void {
  // 与表级 CHECK 约束同一口径：撤销必须留下时间，有效记录不能带撤销时间。
  if (record.status === 'void' && record.voided_at === null) {
    issues.push(`${path} 已撤销但缺少撤销时间`);
  }
  if (record.status === 'active' && record.voided_at !== null) {
    issues.push(`${path} 有效却带着撤销时间`);
  }
  // 撤销原因跟着撤销走。一条「有效」却写着撤销原因的记录在界面上无法解释，
  // 只能是文件被改过或导出侧出了 bug。
  if (record.status === 'active' && record.void_reason !== null) {
    issues.push(`${path} 有效却带着撤销原因`);
  }
}

function checkWishlist(
  issues: string[],
  wishlistItems: readonly { readonly budget_minor: number | null; readonly institution_id: string | null }[],
  institutionIds: ReadonlySet<string>,
): void {
  wishlistItems.forEach((wish, index) => {
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
  checkUnknownKeys(issues, path, Object.keys(spec), row);
}

/**
 * 多出来的键一律拒绝。
 *
 * 备份是一份**数据**，字段集合是封闭的。多出来的键只有两种可能：
 * 文件来自一个本版本读不懂的结构（那该走兼容性拒绝），或者有人在文件里
 * 塞了本 App 不认识的东西。恢复代码用的是写死的列名与参数绑定，
 * 多余的键根本不会被写进去；但**默默忽略**它们意味着我们无法分辨
 * 「一份正常备份」和「一份被改过的文件」，用户也就不会得到任何提示。
 * 任务书第六节明确要求不接受多余的危险控制字段、SQL、表名指令与动态列名。
 *
 * 只报**数量与位置**，不回显键名，也不回显取值：这些 `issues` 会进 `__DEV__`
 * 日志，而键名本身就可能是攻击者或用户数据的一部分（任务书第六、九节）。
 */
function checkUnknownKeys(
  issues: string[],
  path: string,
  allowed: readonly string[],
  row: Readonly<Record<string, unknown>>,
): void {
  const known = new Set(allowed);
  const extra = Object.keys(row).filter((key) => !known.has(key)).length;
  if (extra > 0) {
    issues.push(`${path} 含有 ${extra} 个无法识别的字段`);
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
    case 'name':
      // 与各表的 `length(trim(...)) > 0` 同一口径：全是空格的名称写得进 JSON，
      // 写不进表，必须在这里挡下而不是等事务里炸。
      return typeof value === 'string' && value.trim().length > 0;
    case 'currency':
      return typeof value === 'string' && value.length === CURRENCY_LENGTH;
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
      // 用日历真实性校验，不只看 `YYYY-MM-DD` 的形状：2026-02-30 形状完全正确，
      // 却不是一个存在的日期，放进去之后每一处日期比较都会给出没有意义的结果。
      return typeof value === 'string' && isBusinessDate(value);
    case 'timestamp':
    case 'nullableTimestamp':
      return isTimestamp(value);
    case 'category':
    case 'nullableCategory':
      return isOneOf(PURCHASE_ITEM_CATEGORIES, value);
    case 'nullableCode':
      return typeof value === 'string' && value.length > 0;
    case 'nullableName':
      return typeof value === 'string' && value.trim().length > 0;
    case 'redemptionStatus':
      return isOneOf(REDEMPTION_STATUSES, value);
    case 'purchaseKind':
      return isOneOf(PURCHASE_KINDS, value);
    case 'personStatus':
      return isOneOf(PERSON_STATUSES, value);
    case 'sourceKind':
      return isOneOf(USAGE_SOURCE_KINDS, value);
    case 'usageStatus':
      return isOneOf(USAGE_STATUSES, value);
  }
}

function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value);
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

function fail(
  issues: readonly string[],
  kind: BackupValidationFailureKind,
): BackupValidationFailure {
  if (issues.length <= MAX_ISSUES) {
    return { ok: false, kind, issues };
  }
  return {
    ok: false,
    kind,
    issues: [...issues.slice(0, MAX_ISSUES), `另有 ${issues.length - MAX_ISSUES} 项问题未列出`],
  };
}
