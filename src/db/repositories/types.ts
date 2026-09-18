import type {
  BusinessDate,
  InstitutionRow,
  PurchaseItemCategory,
  PurchaseItemRow,
  PurchaseRow,
  RedemptionRecordRow,
  RedemptionStatus,
  UtcTimestamp,
} from '../types';

/**
 * repository 层的对外契约。
 *
 * service 只依赖本文件里的**类型**，不依赖 expo-sqlite 实现（ARCHITECTURE 第三节）。
 * Phase 3 换成「本地缓存 + 云端权威」时，替换的是实现，service 与页面不动。
 */

/** 机构选择器需要的最小字段集，不返回整行。 */
export type InstitutionOption = {
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
};

export type InstitutionRepository = {
  /** 当前档案下未归档的机构，按名称升序，供选择器复用（PRD-INST-002）。 */
  listSelectable(profileId: string): Promise<InstitutionOption[]>;
  /** 按判重键查找已有机构；用于「同名则复用，不重复创建」。 */
  findByNormalizedName(profileId: string, normalizedName: string): Promise<InstitutionRow | null>;
  /** 按 ID 查找，同时校验归属于该档案。 */
  findById(profileId: string, institutionId: string): Promise<InstitutionRow | null>;
  insert(row: InstitutionRow): Promise<void>;
};

/**
 * 套餐列表的查询结果行。
 *
 * 项目数、总购买次数与有效核销数由 SQL 聚合得出，`remaining` 不在这里计算、
 * 更不落库，由 service 层派生（ADR-013、ARCHITECTURE 第四节）。
 */
export type PurchaseSummaryRow = {
  readonly id: string;
  readonly name: string;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly purchase_date: BusinessDate;
  readonly total_amount_minor: number;
  readonly currency: string;
  readonly expires_on: BusinessDate | null;
  readonly created_at: UtcTimestamp;
  readonly item_count: number;
  readonly total_quantity: number;
  readonly active_redemption_count: number;
};

/**
 * 永久删除一个套餐会连带清除多少数据（PRD-PUR-009、E-08）。
 *
 * 核销记录数**包含已撤销的记录**：它们同样会随套餐一起消失，
 * 确认框里少报一条都是误导。
 */
export type PurchaseDeletionImpactRow = {
  readonly item_count: number;
  readonly redemption_count: number;
};

/**
 * 快捷核销选择页的一个候选项目：项目 + 它所属套餐的展示信息。
 *
 * 与其他行一样不含 `remaining`：`quantity` 与 `active_redemption_count` 分开返回，
 * 余次由 service 派生（ADR-013）。SQL 只用这两列做「还有余次」的过滤，
 * 不把派生结果当成一列查出来。
 */
export type RedeemableItemRow = {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly active_redemption_count: number;
  readonly purchase_id: string;
  readonly purchase_name: string;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly expires_on: BusinessDate | null;
};

/**
 * 编辑套餐时每个现存项目的安全上下文。
 *
 * 比 `PurchaseItemDetailRow` 多一列 `redemption_count`：它统计**全部**核销记录，
 * 含已撤销。两个计数回答两个不同的问题，不能互相替代：
 *
 * - `active_redemption_count` 决定「次数最少能改到几」（PRD-PUR-008、E-06）。
 * - `redemption_count` 决定「这个项目还能不能从套餐里删掉」。已撤销的核销
 *   同样是历史，编辑套餐不得把它顺手清掉，因此只要有过任何一条记录就不允许删除。
 */
export type PurchaseItemEditRow = {
  readonly id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  readonly quantity: number;
  readonly unit_amount_minor: number;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
  /** 有效核销数（只数 `status = 'active'`） */
  readonly active_redemption_count: number;
  /** 全部核销数，含已撤销 */
  readonly redemption_count: number;
};

/** 更新一个套餐项目时允许改写的列；`id` 与 `purchase_id` 只用于定位。 */
export type PurchaseItemUpdate = {
  readonly id: string;
  readonly purchase_id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  readonly quantity: number;
  readonly unit_amount_minor: number;
  readonly notes: string | null;
  readonly updated_at: UtcTimestamp;
};

export type PurchaseRepository = {
  /** 按购买日期倒序、同日按创建时间倒序返回全部套餐概览。 */
  listSummaries(profileId: string): Promise<PurchaseSummaryRow[]>;
  /**
   * 当前档案下**仍有剩余次数**的全部项目，按有效期先后排序。
   *
   * 过期的项目照样返回：有效期不影响余次，也不禁止核销（ADR-017、PRD-RED-014）。
   */
  listRedeemableItems(profileId: string): Promise<RedeemableItemRow[]>;
  /** 按 ID 读取单个套餐，同时校验归属于该档案；不存在时返回 null。 */
  findById(profileId: string, purchaseId: string): Promise<PurchaseRow | null>;
  /**
   * 套餐下的全部项目及各自的有效核销数，按录入顺序返回。
   *
   * 不带 `profileId`：调用方必须先用 `findById` 确认套餐归属，再用同一个
   * `purchaseId` 取项目。项目本身没有档案列，在这里再 JOIN 一次套餐只会
   * 重复一次同样的校验。
   */
  listItemDetails(purchaseId: string): Promise<PurchaseItemDetailRow[]>;
  /**
   * 套餐下的全部项目，附带有效核销数与全部核销数，按录入顺序返回。
   *
   * 编辑流程专用：既用于进入编辑页时取初值，也用于**事务内**的二次校验。
   * 不带 `profileId`，同 `listItemDetails`：调用方先用 `findById` 确认归属。
   */
  listItemsForEdit(purchaseId: string): Promise<PurchaseItemEditRow[]>;
  /** 读取单个项目及其所属套餐的机构与有效期，同时校验档案归属。 */
  findItemContext(profileId: string, purchaseItemId: string): Promise<PurchaseItemContextRow | null>;
  /**
   * 统计这个套餐名下的项目数与全部核销记录数（含已撤销）。
   *
   * 不带 `profileId`，同 `listItemDetails`：调用方先用 `findById` 确认归属。
   */
  getDeletionImpact(purchaseId: string): Promise<PurchaseDeletionImpactRow>;
  /**
   * 物理删除套餐及其项目与核销记录，返回被删除的**套餐**行数（正常为 1）。
   *
   * 机构与档案不在删除范围内（ADR-016、PRD-PUR-014）。
   * 必须在事务内调用：实现会分多条语句清理子表。
   */
  deletePermanently(profileId: string, purchaseId: string): Promise<number>;
  insert(row: PurchaseRow): Promise<void>;
  /**
   * 更新套餐自身的可编辑字段，返回实际更新的行数（正常为 1）。
   *
   * 只改本行：机构与城市快照写在 `purchases` 上，**不触及 `redemption_records`
   * 的同名快照列**。核销快照记录的是「那一次核销发生时的机构」，
   * 是历史事实，不随套餐改机构而变（PRD 第 5A.2 节、PRD-INST-005）。
   *
   * `currency` 不在可写列内：第一版只有 CNY（Q-11），编辑页也没有这个字段。
   */
  update(row: PurchaseUpdate): Promise<number>;
  insertItems(rows: readonly PurchaseItemRow[]): Promise<void>;
  /**
   * 更新一个既有项目，返回实际更新的行数（正常为 1）。
   *
   * 走 UPDATE 而不是「删掉再插一条」：项目 ID 是核销记录的外键目标，
   * 换 ID 等于把这个项目的核销历史全部指向空处（任务书第三节）。
   */
  updateItem(row: PurchaseItemUpdate): Promise<number>;
  /**
   * 删除一个**从未产生过任何核销记录**的项目，返回实际删除的行数。
   *
   * 「没有核销历史」是写进 SQL 的删除条件而不是先查后删：即便调用方漏判，
   * 或在读与写之间刚好新增了一条核销，这条语句也只会删 0 行。
   * 调用方必须校验返回值为 1，为 0 时回滚并提示刷新（任务书第七节）。
   */
  deleteItem(purchaseId: string, purchaseItemId: string): Promise<number>;
};

/** 更新一个套餐时允许改写的列；`id` 与 `profile_id` 只用于定位。 */
export type PurchaseUpdate = {
  readonly id: string;
  readonly profile_id: string;
  readonly institution_id: string | null;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly name: string;
  readonly purchase_date: BusinessDate;
  readonly total_amount_minor: number;
  readonly expires_on: BusinessDate | null;
  readonly notes: string | null;
  readonly updated_at: UtcTimestamp;
};

/**
 * 套餐详情中的一个项目：项目字段 + 该项目的有效核销数。
 *
 * 与列表一样，`remaining` 不在这里出现——它由 service 用
 * `quantity - active_redemption_count` 派生（ADR-013）。
 */
export type PurchaseItemDetailRow = {
  readonly id: string;
  readonly name: string;
  readonly category: PurchaseItemCategory;
  readonly quantity: number;
  readonly unit_amount_minor: number;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
  readonly active_redemption_count: number;
};

/**
 * 核销表单需要的项目上下文：项目本身，加上它所属套餐的机构快照与有效期。
 *
 * 刻意**不含**有效核销数：核销事务要求「事务内重新读取项目」与「事务内统计
 * 有效核销数」是两步独立的读取（任务书第八节），把计数混进来会让人以为
 * 这一行里的数字可以直接用来判断余次。
 */
export type PurchaseItemContextRow = {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly purchase_id: string;
  readonly purchase_name: string;
  readonly purchase_date: BusinessDate;
  readonly expires_on: BusinessDate | null;
  readonly institution_id: string | null;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
};

/** 套餐详情中的一条核销历史：核销字段 + 所属项目名称。 */
export type RedemptionHistoryRow = {
  readonly id: string;
  readonly purchase_item_id: string;
  readonly item_name: string;
  readonly redeemed_on: BusinessDate;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly status: RedemptionStatus;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
  /** 撤销时间；`status = 'active'` 时必为空（表级 CHECK 约束） */
  readonly voided_at: UtcTimestamp | null;
  /** 撤销原因，用户可以不填；不填时为 null，不编造默认原因 */
  readonly void_reason: string | null;
};

/**
 * 完整核销历史的状态过滤条件。
 *
 * 这是**数据库口径**的取值，与界面上的「全部 / 有效 / 已撤销」不是同一层：
 * 页面用的是用户语言，service 负责翻译过来（PRD-RED-010）。
 * `'all'` 表示不加状态条件，两种状态都返回。
 */
export type RedemptionStatusFilter = 'all' | 'active' | 'void';

/**
 * 完整核销历史里的一条记录：核销本身 + 它所属的项目与套餐。
 *
 * 机构与城市取的是 `redemption_records` 自己的快照列，**不是**套餐现在的机构：
 * 快照记的是「那一次实际在哪做的」，套餐后来改了机构也不该改写它
 * （PRD 第 5A.2 节、PRD-INST-005、PRD-PUR-018）。
 *
 * 与 `RedemptionHistoryRow` 的区别：那个是套餐详情内的历史，已知属于哪个套餐；
 * 这里跨套餐，所以必须带上套餐 ID 与名称，点击才知道要跳到哪一页。
 */
export type RedemptionHistoryEntryRow = {
  readonly id: string;
  readonly purchase_item_id: string;
  readonly item_name: string;
  readonly purchase_id: string;
  readonly purchase_name: string;
  readonly redeemed_on: BusinessDate;
  readonly status: RedemptionStatus;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
  readonly notes: string | null;
  readonly created_at: UtcTimestamp;
  readonly voided_at: UtcTimestamp | null;
  readonly void_reason: string | null;
};

/**
 * 撤销核销所需的上下文：核销记录本身，加上它所属的项目与套餐。
 *
 * 一次查询同时回答三个问题：记录在不在、属不属于这个档案、现在是不是有效。
 * 归属只能靠 JOIN 得到——`redemption_records` 与 `purchase_items` 都没有
 * `profile_id`，唯一带档案列的是 `purchases`。
 */
export type RedemptionContextRow = {
  readonly id: string;
  readonly purchase_item_id: string;
  readonly item_name: string;
  readonly purchase_id: string;
  readonly redeemed_on: BusinessDate;
  readonly status: RedemptionStatus;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
};

export type RedemptionRepository = {
  /**
   * 某个项目的有效核销数（只数 `status = 'active'`）。
   *
   * 这是余次的唯一依据。在事务内调用时，它读到的是事务快照，
   * 与随后插入的那条记录处在同一个原子区间。
   */
  countActiveByItem(purchaseItemId: string): Promise<number>;
  /** 套餐下的全部核销记录，按核销日期倒序、同日按创建时间倒序。 */
  listByPurchase(purchaseId: string): Promise<RedemptionHistoryRow[]>;
  /**
   * 当前档案下**跨套餐**的全部核销记录，按 `filter` 过滤状态。
   *
   * 排序为 `redeemed_on DESC, created_at DESC, id DESC`。第三列是稳定性保险：
   * 同一天同一毫秒导入的两条记录若只比前两列，返回顺序由 SQLite 自行决定，
   * 两次查询可能不一致，分组后看起来就像记录在跳动。
   *
   * 已用完与已过期套餐下的记录照常返回：它们仍然是发生过的事实。
   * 已被永久删除的套餐不会出现——那些记录在删除时已随套餐物理消失（ADR-016）。
   */
  listHistory(
    profileId: string,
    filter: RedemptionStatusFilter,
  ): Promise<RedemptionHistoryEntryRow[]>;
  /** 按 ID 读取一条核销及其项目与套餐，同时校验档案归属；不存在时返回 null。 */
  findById(profileId: string, redemptionId: string): Promise<RedemptionContextRow | null>;
  /**
   * 把一条**仍然有效**的核销改为已撤销，返回实际更新的行数。
   *
   * 条件写在 SQL 里（`WHERE id = ? AND status = 'active'`）而不是只靠先读后判断：
   * 读与写之间哪怕在同一个事务里，条件更新也是唯一能让「已经撤销过」
   * 这件事以 0 行结果自证的方式。调用方必须校验返回值为 1，
   * 否则余次会被重复恢复（任务书第六节）。
   */
  voidById(
    redemptionId: string,
    voidedAt: UtcTimestamp,
    voidReason: string | null,
  ): Promise<number>;
  insert(row: RedemptionRecordRow): Promise<void>;
};

/**
 * 首页两张统计卡的聚合结果，一次查询返回一行。
 *
 * 三个数字各自独立：`total_quantity` 是买了多少次，`active_redemption_count`
 * 是用掉多少次，两者相减才是「待使用」。相减放在 service 做，
 * 因为负值需要被夹到 0，而那是业务判断不是存储判断（E-05）。
 */
export type DashboardTotalsRow = {
  /** 全部套餐项目的购买次数之和 */
  readonly total_quantity: number;
  /** 全部有效核销数（只数 `status = 'active'`） */
  readonly active_redemption_count: number;
  /** 全部套餐总价之和，整数分 */
  readonly total_amount_minor: number;
};

/**
 * 首页「最近记录」里的一条有效核销。
 *
 * 只返回展示与跳转需要的列：已撤销的记录不会出现在这里，
 * 所以不带 `status`、`voided_at`，避免上层误以为还要自己过滤。
 */
export type RecentRedemptionRow = {
  readonly id: string;
  readonly purchase_item_id: string;
  readonly item_name: string;
  readonly purchase_id: string;
  readonly purchase_name: string;
  readonly redeemed_on: BusinessDate;
  readonly institution_name_snapshot: string | null;
  readonly city_snapshot: string | null;
};

export type DashboardRepository = {
  /** 首页两张统计卡所需的三个总数，一条 SQL 聚合完成。 */
  getTotals(profileId: string): Promise<DashboardTotalsRow>;
  /**
   * 最近的有效核销，按核销日期倒序、同日按创建时间倒序，最多 `limit` 条。
   *
   * 已撤销的记录与已被永久删除的套餐下的记录都不会出现：前者由
   * `status = 'active'` 排除，后者在删除时已连同记录一起物理消失（ADR-016）。
   */
  listRecentRedemptions(profileId: string, limit: number): Promise<RecentRedemptionRow[]>;
};

/** 一组绑定在同一个连接（或同一个事务）上的 repository。 */
export type RepositoryBundle = {
  readonly institutions: InstitutionRepository;
  readonly purchases: PurchaseRepository;
  readonly redemptions: RedemptionRepository;
  readonly dashboard: DashboardRepository;
};

/**
 * 数据访问入口。
 *
 * 直接读取用 bundle 上的成员；需要多表原子写入时用 `transaction`，
 * 回调里拿到的是绑定在事务连接上的另一组 repository，出了回调即失效。
 */
export type DataAccess = RepositoryBundle & {
  transaction<T>(task: (repositories: RepositoryBundle) => Promise<T>): Promise<T>;
};
