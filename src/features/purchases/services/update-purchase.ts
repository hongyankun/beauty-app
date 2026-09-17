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
import {
  assertHasAtLeastOneItem,
  assertPurchaseBasicsAreValid,
  assertPurchaseItemIsValid,
  normalizeCity,
  type PurchaseItemFields,
} from './purchase-input-rules';

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
 * 这里完全不写 `redemption_records`：改套餐的机构只改 `purchases` 自己那一行，
 * 历史核销的机构与城市快照记录的是「那一次核销发生时的事实」，不随之变动
 * （PRD 第 5A.2 节、PRD-INST-005）。
 */

/** 一行项目。`purchaseItemId` 为 null 表示这是本次新增的项目。 */
export type UpdatePurchaseItemInput = PurchaseItemFields & {
  readonly purchaseItemId: string | null;
};

export type UpdatePurchaseInput = {
  readonly purchaseId: string;
  readonly name: string;
  readonly institution: InstitutionSelection;
  readonly city: string | null;
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
    if (item.quantity < row.active_redemption_count) {
      throw new PurchaseServiceError(
        `「${row.name}」现在已经核销 ${row.active_redemption_count} 次，` +
          `购买次数不能少于 ${row.active_redemption_count} 次`,
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

/** 按输入写库。调用方保证已经在事务内，并且校验全部通过。 */
async function applyChanges(
  repositories: RepositoryBundle,
  input: UpdatePurchaseInput,
  institutionId: string | null,
  institutionName: string | null,
  city: string | null,
  existing: ReadonlyMap<string, PurchaseItemEditRow>,
  now: string,
): Promise<void> {
  const updated = await repositories.purchases.update({
    id: input.purchaseId,
    profile_id: DEFAULT_PROFILE_ID,
    institution_id: institutionId,
    institution_name_snapshot: institutionName,
    city_snapshot: city,
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
    // 走 UPDATE 保留原 ID。全删再插会让这个项目的核销记录指向一个不存在的项目，
    // 等于把用户的核销历史一次性作废（任务书第三节）。
    const changed = await repositories.purchases.updateItem({
      id: item.purchaseItemId,
      purchase_id: input.purchaseId,
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmountMinor,
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
      category: item.category,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmountMinor,
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
      // DELETE 语句自带 `NOT EXISTS (核销记录)` 条件，删不掉只有一个原因：
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
  const city = normalizeCity(input.city);

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

    // 4. 机构：选已有的会在事务内重新确认存在，新建的按判重键复用，
    //    规则与新增套餐完全一致（ADR-014）。
    const institution = await resolveInstitution(repositories, input.institution, city, now);

    // 5. 写入。每一步都校验受影响行数，对不上就抛出让事务整体回滚。
    await applyChanges(
      repositories,
      input,
      institution?.id ?? null,
      institution?.name ?? null,
      city ?? institution?.city ?? null,
      existing,
      now,
    );
  });
}
