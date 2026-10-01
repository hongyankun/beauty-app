import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemEditRow,
  type PurchaseItemRow,
  type RepositoryBundle,
} from '@/db';
import { createUuid } from '@/utils/uuid';
import { PurchaseServiceError } from './errors';
import { resolveInstitution, type InstitutionSelection } from './institution-selection';
import { resolvePurchaser, type ResolvedPurchaser } from './purchaser-selection';
import {
  assertHasAtLeastOneItem,
  assertPurchaseBasicsAreValid,
  assertPurchaseItemIsValid,
  cityOf,
  type PurchaseItemFields,
} from './purchase-input-rules';
import { assertNewItemNameMatchesIdentity, resolveItemIdentity } from './purchase-item-columns';
import { normalizeInstitutionName } from '@/utils/institution-name';
import {
  allocationSaveRejectedMessage,
  checkAllocationSave,
  type AllocationFacts,
} from './purchase-allocation';

/**
 * 编辑套餐用例。
 *
 * 一次调用完成「解析机构 + 更新套餐 + 更新既有项目 + 新增项目 + 删除无历史的项目」，
 * 整体在一个独占事务里，任意一步失败全部回滚（任务书第六节）。
 *
 * 这一层是次数与删除两条安全规则的**最终裁决点**。表单层先拦一道是为了让用户
 * 在按下保存之前就看到原因，但页面上的数字是打开页面那一刻读到的，可能已经过时；
 * 因此所有判断在事务内**重新读库**之后再做一遍，读到的和写下去的处在同一个原子区间
 * （任务书第四节：两层校验）。
 *
 * 这里完全不写变美记录与使用记录：改套餐的机构只改 `purchases` 自己那一行，
 * 历史核销的机构与城市快照记录的是「那一次核销发生时的事实」，不随之变动
 * （PRD 第 5A.2 节、PRD-INST-005）。改项目名称同样不改写使用记录上的名称快照
 * （PRD 第 5B.5 节）。
 *
 * 项目身份（BT-0021B）：每一行都带上分类、目录代码与自定义名称三列。与事务内读到的库值
 * 逐字相同时原样写回，当前目录不认识的历史值也照常保留；不同则视为用户重新选择了项目，
 * 写入前严格校验。改次数、金额、备注或项目名称都不会重算这三列。
 *
 * 金额分配同样在这里做最终裁决：原本平衡的套餐保存后必须仍然平衡；原本不平衡的套餐
 * 只有在总价、项目集合、各项目次数与分配金额都没变时才能保留原差额（PRD 第 5B.6 节）。
 * 「变没变」只拿事务内读到的库值比较，不信任客户端传来的任何标记。
 *
 * 机构快照（BT-0019B2）：机构**没换**时，套餐的机构名称与城市快照原样保留——
 * 机构后来改名、改地点，不会因为用户顺手改了套餐备注就被写进这个套餐。
 * 换了机构时，名称与城市快照取新机构在事务内此刻的值；套餐不存省市代码。
 *
 * 购买人可以修改（BT-0020）：没改时 ID 与名称快照原样保留；改了则在事务内确认新的人
 * 属于当前档案且仍在使用中，快照取那一刻的名称。购买人不属于金额结构，只改购买人的
 * 不平衡套餐可以保留原差额（PRD 第 5B.6 节）。购买类型不在可写范围内，原样保留。
 */

/** 一行项目。`purchaseItemId` 为 null 表示这是本次新增的项目。 */
export type UpdatePurchaseItemInput = PurchaseItemFields & {
  readonly purchaseItemId: string | null;
};

export type UpdatePurchaseInput = {
  readonly purchaseId: string;
  readonly name: string;
  /** 购买人。与库里相同表示没改，原样保留快照 */
  readonly purchaserPersonId: string;
  /** 当场新增机构时，新机构的地点随选择一起带上；套餐自己不再单独填写城市（BT-0019B2） */
  readonly institution: InstitutionSelection;
  readonly purchaseDate: BusinessDate;
  /** 套餐总价，整数分 */
  readonly totalAmountMinor: number;
  readonly expiresOn: BusinessDate | null;
  readonly notes: string | null;
  /** 保存后套餐里应当存在的全部项目：既有项目带原 ID，新增项目 ID 为 null */
  readonly items: readonly UpdatePurchaseItemInput[];
  /** 用户确认要从套餐里移除的既有项目 ID；必须全部没有核销历史 */
  readonly removedItemIds: readonly string[];
};

const MISSING_MESSAGE = '找不到这个套餐，它可能已经被删除了';

/** 页面数据已经过时时的统一收尾建议：不暴露原因细节，只给一条能走的路。 */
const REFRESH_HINT = '请返回重新打开这个套餐后再试';

function itemMissingMessage(name: string): string {
  return `「${name}」已经不在这个套餐里了，${REFRESH_HINT}`;
}

/** 入参自身的校验：不读库，只看这份输入是否自洽。 */
function assertInputIsValid(input: UpdatePurchaseInput): void {
  assertPurchaseBasicsAreValid(input);
  assertHasAtLeastOneItem(input.items.length);

  for (const item of input.items) {
    assertPurchaseItemIsValid(item);
  }

  // 同一个既有项目不能在表单里出现两次，否则后一次更新会静默盖掉前一次，
  // 而用户以为自己改的是两行。
  const seen = new Set<string>();
  for (const item of input.items) {
    if (item.purchaseItemId === null) {
      continue;
    }
    if (seen.has(item.purchaseItemId)) {
      throw new PurchaseServiceError(`「${item.name.trim()}」重复出现了，${REFRESH_HINT}`);
    }
    seen.add(item.purchaseItemId);
  }

  // 「既要保留又要删除」是自相矛盾的指令，宁可拒绝也不替用户挑一个。
  for (const removedId of input.removedItemIds) {
    if (seen.has(removedId)) {
      throw new PurchaseServiceError(`同一个项目不能既保留又删除，${REFRESH_HINT}`);
    }
  }
}

/**
 * 事务内的安全校验：次数不得少于有效核销数，有核销历史的项目不得删除。
 *
 * 入参 `existing` 必须是**事务内**刚刚读到的那一份。
 */
function assertChangesAreSafe(
  input: UpdatePurchaseInput,
  existing: ReadonlyMap<string, PurchaseItemEditRow>,
): void {
  for (const item of input.items) {
    if (item.purchaseItemId === null) {
      continue;
    }

    const row = existing.get(item.purchaseItemId);
    if (row === undefined) {
      throw new PurchaseServiceError(itemMissingMessage(item.name.trim()));
    }

    // 只看有效核销数：已撤销的核销不占用次数，撤销后那一次就该能重新填回去
    // （PRD 第 7.2 节、PRD-PUR-008、E-06）。
    //
    // 下限取「有效核销数」与「库里现在的次数」中较小的一个：历史数据可能已经超用
    // （有效核销数 > 购买次数，DATA_MODEL_V4 第 11.4 节），这类项目允许保持或调高次数，
    // 以便照常修改套餐的其他内容；但不得再调低，否则就是新增超用。
    const minQuantity = Math.min(row.active_redemption_count, row.quantity);
    if (item.quantity < minQuantity) {
      throw new PurchaseServiceError(
        minQuantity === row.active_redemption_count
          ? `「${row.name}」现在已经核销 ${row.active_redemption_count} 次，` +
              `购买次数不能少于 ${minQuantity} 次`
          : `「${row.name}」已经核销 ${row.active_redemption_count} 次，` +
              `购买次数不能少于原来的 ${minQuantity} 次`,
      );
    }
  }

  for (const removedId of input.removedItemIds) {
    const row = existing.get(removedId);
    if (row === undefined) {
      // 已经不在了就等于目标已达成，但仍然拒绝：说明这份页面数据整体过时，
      // 继续保存下去，它对其他项目的判断同样不可信。
      throw new PurchaseServiceError(`要删除的项目已经不在这个套餐里了，${REFRESH_HINT}`);
    }
    // 不分 active 与 void：已撤销的核销同样是历史，编辑套餐不得把它清掉。
    if (row.redemption_count > 0) {
      throw new PurchaseServiceError(`「${row.name}」已有核销历史，不能从套餐中删除`);
    }
  }

  // 保存后套餐里还剩几个项目：表单带上来的 + 库里有但表单没提到也没要求删的。
  // 后者是防御性的——正常情况下表单会带上全部既有项目。
  const untouched = [...existing.keys()].filter(
    (id) =>
      !input.removedItemIds.includes(id) &&
      !input.items.some((item) => item.purchaseItemId === id),
  );
  assertHasAtLeastOneItem(input.items.length + untouched.length);
}

/**
 * 事务内的金额分配校验。
 *
 * `stored` 是事务内读到的套餐总价与项目；`next` 是保存后套餐里会有的全部项目，
 * 包括表单没带上、也没要求删除的既有项目（它们的次数与金额原样保留）。
 */
function assertAllocationIsSavable(
  input: UpdatePurchaseInput,
  storedTotalMinor: number,
  existing: ReadonlyMap<string, PurchaseItemEditRow>,
): void {
  const rows = [...existing.values()];
  const stored: AllocationFacts = {
    totalMinor: storedTotalMinor,
    items: rows.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      allocatedMinor: row.allocated_amount_minor,
    })),
  };
  const untouched = rows.filter(
    (row) =>
      !input.removedItemIds.includes(row.id) &&
      !input.items.some((item) => item.purchaseItemId === row.id),
  );
  const next: AllocationFacts = {
    totalMinor: input.totalAmountMinor,
    items: [
      ...input.items.map((item) => ({
        id: item.purchaseItemId,
        quantity: item.quantity,
        allocatedMinor: item.allocatedAmountMinor,
      })),
      ...untouched.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        allocatedMinor: row.allocated_amount_minor,
      })),
    ],
  };

  const check = checkAllocationSave(stored, next);
  if (!check.ok) {
    throw new PurchaseServiceError(allocationSaveRejectedMessage(check));
  }
}

/**
 * 事务内的项目身份校验，在任何写入之前完成：身份没变的行原样通过，变了的行（以及新增的行）
 * 必须是当前目录里的合法新选择；新增的自定义项目名称还必须等于自定义名称。
 * `existing` 必须是事务内刚读到的那一份。
 */
function assertItemIdentitiesAreSavable(
  input: UpdatePurchaseInput,
  existing: ReadonlyMap<string, PurchaseItemEditRow>,
): void {
  for (const item of input.items) {
    const stored = item.purchaseItemId === null ? null : (existing.get(item.purchaseItemId) ?? null);
    resolveItemIdentity(stored, item.service, item.name);
    if (item.purchaseItemId === null) {
      assertNewItemNameMatchesIdentity(item.service, item.name);
    }
  }
}

type InstitutionSnapshots = {
  readonly institutionName: string | null;
  readonly city: string | null;
};

/**
 * 这次保存是否「没换机构」。只拿事务内读到的套餐行判断，不信任页面传来的标记。
 *
 * - 解析出的机构 ID 与套餐现在关联的相同：没换。
 * - 套餐原本没有关联机构 ID、却有机构名称快照（迁移前的旧数据）：编辑页会把它预填成
 *   「新机构」并带上同一个名称，保存时才第一次关联到一条机构行。只要名称按判重规则相同，
 *   就仍然是同一家店，快照不变。
 * - 其余情况（改选了别的机构、清空机构、从无到有）：换了。
 */
function isSameInstitution(
  purchase: { readonly institution_id: string | null; readonly institution_name_snapshot: string | null },
  selection: InstitutionSelection,
  resolvedId: string | null,
): boolean {
  if (resolvedId === null) {
    // 清空机构时快照随之清空，与「从来没填过」一致。
    return purchase.institution_id === null && purchase.institution_name_snapshot === null;
  }
  if (purchase.institution_id !== null) {
    return purchase.institution_id === resolvedId;
  }
  return (
    selection.kind === 'new' &&
    purchase.institution_name_snapshot !== null &&
    normalizeInstitutionName(selection.name) === normalizeInstitutionName(purchase.institution_name_snapshot)
  );
}

/** 按输入写库。调用方保证已经在事务内，并且校验全部通过。 */
async function applyChanges(
  repositories: RepositoryBundle,
  input: UpdatePurchaseInput,
  purchaser: ResolvedPurchaser,
  institutionId: string | null,
  snapshots: InstitutionSnapshots,
  existing: ReadonlyMap<string, PurchaseItemEditRow>,
  now: string,
): Promise<void> {
  const updated = await repositories.purchases.update({
    id: input.purchaseId,
    profile_id: DEFAULT_PROFILE_ID,
    purchaser_person_id: purchaser.personId,
    purchaser_name_snapshot: purchaser.nameSnapshot,
    institution_id: institutionId,
    institution_name_snapshot: snapshots.institutionName,
    city_snapshot: snapshots.city,
    name: input.name.trim(),
    purchase_date: input.purchaseDate,
    total_amount_minor: input.totalAmountMinor,
    expires_on: input.expiresOn,
    notes: input.notes,
    updated_at: now,
  });
  if (updated !== 1) {
    throw new PurchaseServiceError(MISSING_MESSAGE);
  }

  for (const item of input.items) {
    if (item.purchaseItemId === null) {
      continue;
    }
    // `assertChangesAreSafe` 已经确认它在事务内读到的那一份里。
    const stored = existing.get(item.purchaseItemId) ?? null;
    // 走 UPDATE 保留原 ID。全删再插会让这个项目的核销记录指向一个不存在的项目，
    // 等于把用户的核销历史一次性作废（任务书第三节）。
    // 项目身份没变时三列原样保留，规则见 purchase-item-columns。
    const changed = await repositories.purchases.updateItem({
      id: item.purchaseItemId,
      purchase_id: input.purchaseId,
      name: item.name.trim(),
      ...resolveItemIdentity(stored, item.service, item.name),
      quantity: item.quantity,
      allocated_amount_minor: item.allocatedAmountMinor,
      notes: item.notes,
      updated_at: now,
    });
    if (changed !== 1) {
      throw new PurchaseServiceError(itemMissingMessage(item.name.trim()));
    }
  }

  const newItems: PurchaseItemRow[] = input.items
    .filter((item) => item.purchaseItemId === null)
    .map((item) => ({
      id: createUuid(),
      purchase_id: input.purchaseId,
      name: item.name.trim(),
      ...resolveItemIdentity(null, item.service, item.name),
      quantity: item.quantity,
      allocated_amount_minor: item.allocatedAmountMinor,
      notes: item.notes,
      created_at: now,
      updated_at: now,
    }));
  if (newItems.length > 0) {
    await repositories.purchases.insertItems(newItems);
  }

  for (const removedId of input.removedItemIds) {
    const deleted = await repositories.purchases.deleteItem(input.purchaseId, removedId);
    if (deleted !== 1) {
      // DELETE 语句自带 `NOT EXISTS (使用记录)` 条件，删不掉只有一个原因：
      // 就在刚才这几毫秒里，这个项目有了核销记录。整体回滚，不留下半套修改。
      const name = existing.get(removedId)?.name ?? '这个项目';
      throw new PurchaseServiceError(
        `「${name}」刚刚产生了新的核销记录，已经不能从套餐中删除，${REFRESH_HINT}`,
      );
    }
  }
}

/**
 * 保存对一个套餐的修改。
 *
 * 失败时抛 `PurchaseServiceError`（业务原因，文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。两类都会让整个事务回滚。
 */
export async function updatePurchase(
  dataAccess: DataAccess,
  input: UpdatePurchaseInput,
): Promise<void> {
  assertInputIsValid(input);

  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新确认套餐存在且属于当前档案。
    const purchase = await repositories.purchases.findById(DEFAULT_PROFILE_ID, input.purchaseId);
    if (purchase === null) {
      throw new PurchaseServiceError(MISSING_MESSAGE);
    }

    // 2. 事务内重新读取项目与两种核销计数，作为安全判断的唯一依据。
    const rows = await repositories.purchases.listItemsForEdit(purchase.id);
    const existing = new Map(rows.map((row) => [row.id, row]));

    // 3. 判断。任何一条不成立都抛出，事务尚未写入任何内容。
    assertChangesAreSafe(input, existing);
    assertItemIdentitiesAreSavable(input, existing);
    assertAllocationIsSavable(input, purchase.total_amount_minor, existing);

    // 4. 购买人：没改则原样保留 ID 与快照；改了则确认同一档案、存在且使用中。
    const purchaser = await resolvePurchaser(repositories, input.purchaserPersonId, purchase);

    // 5. 机构：选已有的会在事务内重新确认存在，新建的按判重键复用，
    //    规则与新增套餐完全一致（ADR-014）。
    const institution = await resolveInstitution(repositories, input.institution, now);
    const snapshots: InstitutionSnapshots = isSameInstitution(purchase, input.institution, institution?.id ?? null)
      ? { institutionName: purchase.institution_name_snapshot, city: purchase.city_snapshot }
      : { institutionName: institution?.name ?? null, city: cityOf(institution) };

    // 6. 写入。每一步都校验受影响行数，对不上就抛出让事务整体回滚。
    await applyChanges(
      repositories,
      input,
      purchaser,
      institution?.id ?? null,
      snapshots,
      existing,
      now,
    );
  });
}
