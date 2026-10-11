import { isValidNewServiceSelection } from '@/data/service-catalog';
import {
  DEFAULT_PROFILE_ID,
  type BeautyEventRow,
  type BusinessDate,
  type DataAccess,
  type PurchaseItemContextRow,
  type PurchaseItemRow,
  type PurchaseRow,
  type RepositoryBundle,
  type UsageRecordRow,
} from '@/db';
import {
  assertNewPurchaseInputIsValid,
  insertNewPurchase,
  type CreatePurchaseInput,
  type NewPurchaseIds,
} from '@/features/purchases/services/create-purchase';
import { PurchaseServiceError } from '@/features/purchases/services/errors';
import {
  resolveInstitution,
  type InstitutionSelection,
} from '@/features/purchases/services/institution-selection';
import { isPurchaseItemIdentityShape } from '@/features/purchases/services/purchase-input-rules';
import type { PurchaseItemIdentity } from '@/features/purchases/services/purchase-item-columns';
import { isBusinessDate } from '@/utils/business-date';
import { normalizeInstitutionName } from '@/utils/institution-name';
import { MAX_AMOUNT_MINOR } from '@/utils/money';
import {
  eventInstitutionColumns,
  identityMatchesItem,
  isStoredIdentity,
  optionalNotes,
  selectionDisplayName,
  SOURCE_KIND_BY_PURCHASE_KIND,
  usageServiceColumnsFromItem,
  usageServiceColumnsFromSelection,
} from './usage-snapshots';

/**
 * 「记录一次变美」保存用例（BT-0023，PRD 第 5B.3 节，DATA_MODEL_V4 第 4.5、4.6、5.1、7 节）。
 *
 * 一次调用在**一个独占事务**里写完全部内容：当场新增或恢复的机构、「新建套餐并使用」的新套餐、
 * 「本次单独购买」的单次购买、变美记录与全部使用记录。任何一步失败整体回滚，
 * 不会留下「套餐建好了、记录没写上」或相反的半成品。
 *
 * **项目优先**（BT-0023B）：每一行先确定「做了什么项目」（`UsageLineInput.service`），再说明来源。
 * 来源关联到购买项目时，那个购买项目必须与这一行的项目是同一个项目（DATA_MODEL_V4 第 5.5 节的
 * 兼容规则：目录项目代码相同；自定义项目分类相同且自定义名称归一化后相同），由这里在事务内独立校验，
 * 不信任界面的筛选。这一行的项目必须是严格的新选择（启用的目录项目或已清洗的自定义名称）；
 * 唯一例外是与所选已有购买项目库里的身份**逐字相同**的值（从套餐详情带入时原样继承，读宽松）。
 *
 * **幂等**（BT-0023 额外裁决）：表单打开时一次性生成事件、每条使用记录、新套餐与单次购买的全部 ID，
 * 重复提交带的是同一组 ID。事务内先按事件 ID 查：
 * - 已存在、属于当前档案，且内容与这次提交逐项一致：说明上一次已经成功，直接返回，不再写入；
 * - 属于其他档案、内容不同或不完整：拒绝，不补写、不覆盖；
 * - 事件不存在但其他 ID 已被占用：同样拒绝。
 * 独占事务让并发的两次提交排队执行，第二次看到的必然是第一次提交后的库。
 */

/** 一条使用记录从哪里扣：使用已有套餐、新建套餐并使用、本次单独购买、外部来源、暂不关联。 */
export type UsageLineSourceInput =
  /** 已有的套餐项目或单次购买；来源类型由购买类型决定 */
  | { readonly kind: 'purchase_item'; readonly purchaseItemId: string }
  /** 本次一并新建的套餐中的第 `itemIndex` 个项目 */
  | { readonly kind: 'new_package'; readonly purchaseId: string; readonly itemIndex: number }
  /** 本次单独购买：同时新建一条「单次」购买与它唯一的项目，项目就是这一行的项目 */
  | {
      readonly kind: 'single_purchase';
      /** 本次花费，整数分；必填，允许为 0 */
      readonly amountMinor: number;
      readonly purchaserPersonId: string;
      readonly purchaseId: string;
      readonly purchaseItemId: string;
    }
  | { readonly kind: 'external' }
  | { readonly kind: 'unlinked' };

export type UsageLineInput = {
  readonly usageId: string;
  /** 这一行做了什么项目。所有来源都以它为准 */
  readonly service: PurchaseItemIdentity;
  readonly personId: string;
  readonly notes: string | null;
  readonly source: UsageLineSourceInput;
};

export type NewPackageInput = {
  readonly ids: NewPurchaseIds;
  readonly purchase: CreatePurchaseInput;
};

export type CreateBeautyEventInput = {
  readonly eventId: string;
  readonly occurredOn: BusinessDate;
  readonly institution: InstitutionSelection;
  readonly notes: string | null;
  readonly newPackages: readonly NewPackageInput[];
  readonly lines: readonly UsageLineInput[];
};

export type CreateBeautyEventResult = {
  readonly eventId: string;
  /** true 表示这次提交与一次已经完成的保存完全相同，没有写入任何数据 */
  readonly replayed: boolean;
};

/** 一次记录最多的使用记录条数。只是防御异常输入的上限，正常使用远远用不到。 */
export const MAX_USAGE_LINES = 30;

const INVALID_SERVICE_MESSAGE = '选择的项目不在当前项目目录中，请重新选择项目';
const MISMATCHED_ITEM_MESSAGE = '选择的套餐项目与这一行的项目不是同一个项目，请重新选择';

const SAVE_STATE_CONFLICT_MESSAGE =
  '这次记录的保存状态异常，没有写入任何内容。请返回后重新填写一次。';

function fail(message: string): never {
  throw new PurchaseServiceError(message);
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** 事务外的结构校验：不读库就能判断的问题，尽早拒绝。 */
function assertInputIsValid(input: CreateBeautyEventInput): void {
  if (!isBusinessDate(input.occurredOn)) {
    fail('日期不是一个真实存在的日期');
  }
  if (input.lines.length === 0) {
    fail('至少记录一个项目');
  }
  if (input.lines.length > MAX_USAGE_LINES) {
    fail(`一次最多记录 ${MAX_USAGE_LINES} 个项目`);
  }

  // 全部客户端 ID 必须非空且互不相同：同一个 ID 用两次，库里只能落下一行，另一行就丢了。
  const ids: string[] = [input.eventId];
  const packageById = new Map<string, NewPackageInput>();
  for (const pkg of input.newPackages) {
    assertNewPurchaseInputIsValid(pkg.purchase);
    if (pkg.ids.itemIds.length !== pkg.purchase.items.length) {
      fail(SAVE_STATE_CONFLICT_MESSAGE);
    }
    ids.push(pkg.ids.purchaseId, ...pkg.ids.itemIds);
    packageById.set(pkg.ids.purchaseId, pkg);
  }

  const usedPackages = new Set<string>();
  for (const line of input.lines) {
    ids.push(line.usageId);
    if (!isNonEmptyId(line.personId)) {
      fail('请为每个项目选择使用人');
    }
    // 与套餐项目同一条结构规则：恰好三个字段、类型正确（多一个、少一个都拒绝）。
    if (!isPurchaseItemIdentityShape(line.service)) {
      fail('请为每一行选择项目');
    }
    // 关联已有购买项目时，项目可能是原样继承的库值，要等事务内读到那个项目后再判断。
    if (line.source.kind !== 'purchase_item' && !isValidNewServiceSelection(line.service)) {
      fail(INVALID_SERVICE_MESSAGE);
    }
    const source = line.source;
    switch (source.kind) {
      case 'purchase_item':
        if (!isNonEmptyId(source.purchaseItemId)) {
          fail('请为每个项目选择要使用的套餐');
        }
        break;
      case 'new_package': {
        const pkg = packageById.get(source.purchaseId);
        if (
          pkg === undefined ||
          !Number.isInteger(source.itemIndex) ||
          source.itemIndex < 0 ||
          source.itemIndex >= pkg.purchase.items.length
        ) {
          fail('新建套餐的信息不完整，请重新选择这次使用的项目');
        }
        const newItem = pkg.purchase.items[source.itemIndex];
        if (
          newItem === undefined ||
          !identityMatchesItem(line.service, {
            category_code: newItem.service.categoryCode,
            service_code: newItem.service.serviceCode,
            custom_name: newItem.service.customName,
          })
        ) {
          fail('新建的套餐里需要保留一个与这一行项目相同的项目，请修改新套餐');
        }
        usedPackages.add(source.purchaseId);
        break;
      }
      case 'single_purchase':
        if (
          !Number.isSafeInteger(source.amountMinor) ||
          source.amountMinor < 0 ||
          source.amountMinor > MAX_AMOUNT_MINOR
        ) {
          fail('请填写本次单独购买的金额，赠送或未收费填 0');
        }
        if (!isNonEmptyId(source.purchaserPersonId)) {
          fail('请为本次单独购买选择购买人');
        }
        ids.push(source.purchaseId, source.purchaseItemId);
        break;
      case 'external':
      case 'unlinked':
        break;
      default:
        // 不认识的来源（例如构造出来的「原套餐已删除」）一律拒绝：它只能由删除套餐产生。
        fail('这条记录的来源不正确，请重新选择');
    }
  }

  if (ids.some((id) => !isNonEmptyId(id)) || new Set(ids).size !== ids.length) {
    fail(SAVE_STATE_CONFLICT_MESSAGE);
  }
  // 「新建套餐并使用」的新套餐必须真的被这次记录用到；不用的套餐应该去「新增购买记录」建。
  if (usedPackages.size !== input.newPackages.length) {
    fail('新建的套餐没有被这次记录用到，请选择要使用的项目或移除这个新套餐');
  }
}

/** 单次购买的新建输入：一个项目、次数 1、金额等于本次花费、无有效期（DATA_MODEL_V4 第 7 节）。 */
function singlePurchaseInput(
  service: PurchaseItemIdentity,
  source: Extract<UsageLineSourceInput, { kind: 'single_purchase' }>,
  occurredOn: BusinessDate,
  institutionId: string | null,
): CreatePurchaseInput {
  const name = selectionDisplayName(service);
  return {
    // 名称默认取项目名称；之后可以在编辑套餐里修改。
    name,
    purchaserPersonId: source.purchaserPersonId,
    institution: institutionId === null ? { kind: 'none' } : { kind: 'existing', institutionId },
    purchaseDate: occurredOn,
    totalAmountMinor: source.amountMinor,
    expiresOn: null,
    notes: null,
    items: [
      {
        name,
        service,
        quantity: 1,
        allocatedAmountMinor: source.amountMinor,
        notes: null,
      },
    ],
  };
}

/** 同一个已有项目在这次提交里被用了几次，以及它的名称（用于提示）。 */
type ExistingDemand = { readonly item: PurchaseItemContextRow; count: number };

/** 库里这条购买及其项目是否与这次提交里的新建输入逐字段一致（幂等比较用）。 */
async function matchesWrittenPurchase(
  repositories: RepositoryBundle,
  ids: NewPurchaseIds,
  kind: PurchaseRow['purchase_kind'],
  expected: CreatePurchaseInput,
): Promise<boolean> {
  const purchase = await repositories.purchases.findById(DEFAULT_PROFILE_ID, ids.purchaseId);
  if (
    purchase === null ||
    purchase.purchase_kind !== kind ||
    purchase.name !== expected.name.trim() ||
    purchase.purchase_date !== expected.purchaseDate ||
    purchase.expires_on !== expected.expiresOn ||
    purchase.total_amount_minor !== expected.totalAmountMinor ||
    purchase.purchaser_person_id !== expected.purchaserPersonId ||
    purchase.notes !== expected.notes
  ) {
    return false;
  }
  const items = await repositories.purchases.listItemsForEdit(purchase.id);
  if (items.length !== expected.items.length || ids.itemIds.length !== expected.items.length) {
    return false;
  }
  return expected.items.every((want, index) => {
    const got = items.find((candidate) => candidate.id === ids.itemIds[index]);
    return (
      got !== undefined &&
      got.name === want.name.trim() &&
      got.quantity === want.quantity &&
      got.allocated_amount_minor === want.allocatedAmountMinor &&
      got.notes === want.notes &&
      isStoredIdentity(want.service, got)
    );
  });
}

/**
 * 判断库里已有的这条事件是不是「同一个已经完成的请求」。
 *
 * 逐项比较这次提交与库里的事件、使用记录（含每一行的项目）、新套餐与单次购买（含购买人、日期与
 * 每个项目的次数、分配金额与身份）。之后被撤销的使用记录状态会变，状态不参与比较；
 * 其余任何一处对不上，都说明这个 ID 对应的不是这一次提交，必须拒绝而不是当成已完成。
 * 比较按 ID 取行，不受查询顺序影响。
 */
async function matchesCompletedRequest(
  repositories: RepositoryBundle,
  event: BeautyEventRow,
  input: CreateBeautyEventInput,
): Promise<boolean> {
  if (event.occurred_on !== input.occurredOn || event.notes !== optionalNotes(input.notes)) {
    return false;
  }
  const selection = input.institution;
  if (selection.kind === 'none' && event.institution_id !== null) {
    return false;
  }
  if (selection.kind === 'existing' && event.institution_id !== selection.institutionId) {
    return false;
  }
  if (
    selection.kind === 'new' &&
    (event.institution_id === null ||
      normalizeInstitutionName(event.institution_name_snapshot ?? '') !==
        normalizeInstitutionName(selection.name))
  ) {
    return false;
  }

  const usages = await repositories.events.listEventUsages(event.id);
  if (usages.length !== input.lines.length) {
    return false;
  }
  const usageById = new Map(usages.map((usage) => [usage.id, usage]));
  const packageById = new Map(input.newPackages.map((pkg) => [pkg.ids.purchaseId, pkg]));

  for (const line of input.lines) {
    const usage = usageById.get(line.usageId);
    if (usage === undefined || usage.person_id !== line.personId || usage.notes !== optionalNotes(line.notes)) {
      return false;
    }
    // 这一行做的项目必须与库里使用记录的项目快照是同一个项目。
    if (
      !identityMatchesItem(line.service, {
        category_code: usage.category_code_snapshot,
        service_code: usage.service_code_snapshot,
        custom_name: usage.custom_name_snapshot,
      })
    ) {
      return false;
    }
    const source = line.source;
    switch (source.kind) {
      case 'purchase_item':
        if (
          usage.purchase_item_id !== source.purchaseItemId ||
          (usage.source_kind !== 'package_item' && usage.source_kind !== 'single_purchase')
        ) {
          return false;
        }
        break;
      case 'new_package': {
        const pkg = packageById.get(source.purchaseId);
        if (
          pkg === undefined ||
          usage.source_kind !== 'package_item' ||
          usage.purchase_item_id !== pkg.ids.itemIds[source.itemIndex]
        ) {
          return false;
        }
        break;
      }
      case 'single_purchase': {
        if (usage.source_kind !== 'single_purchase' || usage.purchase_item_id !== source.purchaseItemId) {
          return false;
        }
        const expected = singlePurchaseInput(line.service, source, input.occurredOn, event.institution_id);
        if (
          !(await matchesWrittenPurchase(
            repositories,
            { purchaseId: source.purchaseId, itemIds: [source.purchaseItemId] },
            'single',
            expected,
          ))
        ) {
          return false;
        }
        break;
      }
      case 'external':
      case 'unlinked': {
        const expected = usageServiceColumnsFromSelection(line.service);
        if (
          usage.source_kind !== source.kind ||
          usage.purchase_item_id !== null ||
          usage.category_code_snapshot !== expected.category_code_snapshot ||
          usage.service_code_snapshot !== expected.service_code_snapshot ||
          usage.custom_name_snapshot !== expected.custom_name_snapshot
        ) {
          return false;
        }
        break;
      }
      default:
        return false;
    }
  }

  for (const pkg of input.newPackages) {
    if (!(await matchesWrittenPurchase(repositories, pkg.ids, 'package', pkg.purchase))) {
      return false;
    }
  }
  return true;
}

/**
 * 保存一次变美记录，返回事件 ID。
 *
 * 失败时抛 `PurchaseServiceError`（业务原因，文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。
 */
export async function createBeautyEvent(
  dataAccess: DataAccess,
  input: CreateBeautyEventInput,
): Promise<CreateBeautyEventResult> {
  assertInputIsValid(input);
  const now = new Date().toISOString();

  return dataAccess.transaction(async (repositories) => {
    // 1. 幂等：同一个事件 ID 已经存在时，只有「同一个已完成请求」才直接返回。
    const existing = await repositories.events.findEventById(input.eventId);
    if (existing !== null) {
      if (existing.profile_id !== DEFAULT_PROFILE_ID) {
        fail(SAVE_STATE_CONFLICT_MESSAGE);
      }
      if (await matchesCompletedRequest(repositories, existing, input)) {
        return { eventId: existing.id, replayed: true };
      }
      fail(SAVE_STATE_CONFLICT_MESSAGE);
    }

    // 2. 事件还不存在，其余客户端 ID 却已被占用：库里有一份矛盾的数据，不补写、不覆盖。
    const collisions = await repositories.events.countIdCollisions({
      purchaseIds: [
        ...input.newPackages.map((pkg) => pkg.ids.purchaseId),
        ...input.lines.flatMap((line) =>
          line.source.kind === 'single_purchase' ? [line.source.purchaseId] : [],
        ),
      ],
      purchaseItemIds: [
        ...input.newPackages.flatMap((pkg) => pkg.ids.itemIds),
        ...input.lines.flatMap((line) =>
          line.source.kind === 'single_purchase' ? [line.source.purchaseItemId] : [],
        ),
      ],
      usageIds: input.lines.map((line) => line.usageId),
    });
    if (collisions.purchases + collisions.purchase_items + collisions.usage_records > 0) {
      fail(SAVE_STATE_CONFLICT_MESSAGE);
    }

    // 3. 使用人：同一档案、存在且使用中。快照取事务内读到的当前名称，不信任页面上显示的那一份。
    //    所有读取与校验都在写入任何一行之前完成。
    const people = new Map<string, string>();
    for (const line of input.lines) {
      if (people.has(line.personId)) {
        continue;
      }
      const person = await repositories.people.findById(DEFAULT_PROFILE_ID, line.personId);
      if (person === null) {
        fail('选择的使用人已经不存在了，请重新选择使用人');
      }
      if (person.status !== 'active') {
        fail('选择的使用人已经归档，请重新选择使用人');
      }
      people.set(person.id, person.display_name);
    }

    // 4. 已有的套餐项目：同一档案、仍然存在；同一项目被几行使用时按**合计**检查余次。
    //    历史超用（有效使用已多于购买次数）的项目余次为 0，不能再用（DATA_MODEL_V4 第 9.1 节）。
    const demands = new Map<string, ExistingDemand>();
    for (const line of input.lines) {
      if (line.source.kind !== 'purchase_item') {
        continue;
      }
      const known = demands.get(line.source.purchaseItemId);
      if (known !== undefined) {
        known.count += 1;
        continue;
      }
      const item = await repositories.purchases.findItemContext(DEFAULT_PROFILE_ID, line.source.purchaseItemId);
      if (item === null) {
        fail('选择的套餐项目已经不存在了，请重新选择');
      }
      demands.set(item.id, { item, count: 1 });
    }
    // 每一行的项目与它所选的购买项目必须是同一个项目，按事务内读到的现值判断：
    // 页面停留期间项目被改了身份，这里会拦下。项目本身必须是严格的新选择，或与库值逐字相同。
    for (const line of input.lines) {
      if (line.source.kind !== 'purchase_item') {
        continue;
      }
      const demand = demands.get(line.source.purchaseItemId);
      if (demand === undefined) {
        fail(SAVE_STATE_CONFLICT_MESSAGE);
      }
      if (!isValidNewServiceSelection(line.service) && !isStoredIdentity(line.service, demand.item)) {
        fail(INVALID_SERVICE_MESSAGE);
      }
      if (!identityMatchesItem(line.service, demand.item)) {
        fail(MISMATCHED_ITEM_MESSAGE);
      }
    }
    for (const { item, count } of demands.values()) {
      const remaining = Math.max(0, item.quantity - (await repositories.redemptions.countActiveByItem(item.id)));
      if (count > remaining) {
        fail(
          remaining === 0
            ? `「${item.name}」已经没有剩余次数，请换一个来源`
            : `「${item.name}」只剩 ${remaining} 次，这次记录用了 ${count} 次`,
        );
      }
    }

    // 新套餐里每个项目被用了几次，不能超过它的购买次数。
    for (const pkg of input.newPackages) {
      pkg.purchase.items.forEach((item, index) => {
        const used = input.lines.filter(
          (line) =>
            line.source.kind === 'new_package' &&
            line.source.purchaseId === pkg.ids.purchaseId &&
            line.source.itemIndex === index,
        ).length;
        if (used > item.quantity) {
          fail(`新套餐中「${item.name.trim()}」的购买次数少于这次的使用次数`);
        }
      });
    }

    // 5. 变美记录的机构：与套餐共用判重、复用与自动恢复规则（ADR-014）。
    const institution = await resolveInstitution(repositories, input.institution, now);

    // 6. 新套餐与单次购买，与新增套餐页共用同一份事务内写入。
    const writtenPackages = new Map<string, { purchase: PurchaseRow; items: readonly PurchaseItemRow[] }>();
    for (const pkg of input.newPackages) {
      const written = await insertNewPurchase(repositories, pkg.purchase, {
        now,
        purchaseKind: 'package',
        ids: pkg.ids,
      });
      writtenPackages.set(pkg.ids.purchaseId, written);
    }
    const writtenSingles = new Map<string, { purchase: PurchaseRow; item: PurchaseItemRow }>();
    for (const line of input.lines) {
      if (line.source.kind !== 'single_purchase') {
        continue;
      }
      const purchaseInput = singlePurchaseInput(line.service, line.source, input.occurredOn, institution?.id ?? null);
      assertNewPurchaseInputIsValid(purchaseInput);
      const written = await insertNewPurchase(repositories, purchaseInput, {
        now,
        purchaseKind: 'single',
        ids: { purchaseId: line.source.purchaseId, itemIds: [line.source.purchaseItemId] },
      });
      const item = written.items[0];
      if (item === undefined) {
        fail(SAVE_STATE_CONFLICT_MESSAGE);
      }
      writtenSingles.set(line.usageId, { purchase: written.purchase, item });
    }

    // 7. 变美记录。地点快照从机构复制；备注写在事件上，每一行的备注写在各自的使用记录上。
    await repositories.redemptions.insertEvent({
      id: input.eventId,
      profile_id: DEFAULT_PROFILE_ID,
      occurred_on: input.occurredOn,
      ...eventInstitutionColumns(institution),
      notes: optionalNotes(input.notes),
      created_at: now,
      updated_at: now,
    });

    // 8. 使用记录。快照写的是**此刻**的名称，之后改名不回写（PRD 第 5B.5 节）。
    const linkedQuantities = new Map<string, number>();
    for (const line of input.lines) {
      const personName = people.get(line.personId);
      if (personName === undefined) {
        fail(SAVE_STATE_CONFLICT_MESSAGE);
      }
      const base = {
        id: line.usageId,
        event_id: input.eventId,
        person_id: line.personId,
        person_name_snapshot: personName,
        status: 'active' as const,
        voided_at: null,
        void_reason: null,
        notes: optionalNotes(line.notes),
        created_at: now,
        updated_at: now,
      };
      let row: UsageRecordRow;
      const source = line.source;
      switch (source.kind) {
        case 'purchase_item': {
          const demand = demands.get(source.purchaseItemId);
          if (demand === undefined) {
            fail(SAVE_STATE_CONFLICT_MESSAGE);
          }
          const { item } = demand;
          row = {
            ...base,
            source_kind: SOURCE_KIND_BY_PURCHASE_KIND[item.purchase_kind],
            purchase_item_id: item.id,
            ...usageServiceColumnsFromItem(item),
            purchase_name_snapshot: item.purchase_name,
            purchase_item_name_snapshot: item.name,
          };
          linkedQuantities.set(item.id, item.quantity);
          break;
        }
        case 'new_package': {
          const written = writtenPackages.get(source.purchaseId);
          const item = written?.items[source.itemIndex];
          if (written === undefined || item === undefined) {
            fail(SAVE_STATE_CONFLICT_MESSAGE);
          }
          row = {
            ...base,
            source_kind: 'package_item',
            purchase_item_id: item.id,
            ...usageServiceColumnsFromItem(item),
            purchase_name_snapshot: written.purchase.name,
            purchase_item_name_snapshot: item.name,
          };
          linkedQuantities.set(item.id, item.quantity);
          break;
        }
        case 'single_purchase': {
          const written = writtenSingles.get(line.usageId);
          if (written === undefined) {
            fail(SAVE_STATE_CONFLICT_MESSAGE);
          }
          row = {
            ...base,
            source_kind: 'single_purchase',
            purchase_item_id: written.item.id,
            ...usageServiceColumnsFromItem(written.item),
            purchase_name_snapshot: written.purchase.name,
            purchase_item_name_snapshot: written.item.name,
          };
          linkedQuantities.set(written.item.id, written.item.quantity);
          break;
        }
        case 'external':
        case 'unlinked':
          // 新建为外部来源或暂不关联时没有套餐名称快照（DATA_MODEL_V4 第 4.6 节）。
          row = {
            ...base,
            source_kind: source.kind,
            purchase_item_id: null,
            ...usageServiceColumnsFromSelection(line.service),
            purchase_name_snapshot: null,
            purchase_item_name_snapshot: null,
          };
          break;
      }
      await repositories.redemptions.insertUsage(row);
    }

    // 9. 写入后自检。独占事务的连接没有开启外键：显式确认使用记录条数，
    //    以及每个被用到的项目有效使用数没有超过购买次数。
    const usageCount = await repositories.redemptions.countEventUsages(input.eventId);
    if (usageCount !== input.lines.length) {
      fail(SAVE_STATE_CONFLICT_MESSAGE);
    }
    for (const [itemId, quantity] of linkedQuantities) {
      if ((await repositories.redemptions.countActiveByItem(itemId)) > quantity) {
        fail('有项目的剩余次数刚刚发生了变化，请返回检查后重试');
      }
    }

    return { eventId: input.eventId, replayed: false };
  });
}
