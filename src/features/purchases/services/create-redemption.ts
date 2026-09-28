import { findServiceByCode } from '@/data/service-catalog';
import { otherRegionSelection } from '@/data/administrative-divisions';
import {
  DEFAULT_PROFILE_ID,
  type BusinessDate,
  type DataAccess,
  type UsageSourceKind,
} from '@/db';
import { isBusinessDate } from '@/utils/business-date';
import { createUuid } from '@/utils/uuid';
import { PurchaseServiceError } from './errors';
import { resolveInstitution, type InstitutionSelection } from './institution-selection';

/**
 * 新增单次核销用例。
 *
 * 余次从来不是一个可以读出来再写回去的字段，它是「购买次数 − 有效核销数」。
 * 因此「还能不能核销」这个判断必须和插入发生在**同一个独占事务**里：
 * 页面上读到的余次随时可能已经过期（另一处刚核销过、用户连点了两下、
 * 详情页停在后台很久），只有事务内重算的结果才算数（任务书第八、十一节）。
 *
 * schema v4 起一次核销写成**一条变美记录 + 一条使用记录**（ADR-020）：
 * 使用人由页面选择、默认「自己」（BT-0020，PRD 第 5B.4 节），来源由套餐类型决定。
 * 「记录一次变美」的完整表单属于 BT-0023，这里只保持现有快速核销的其余行为不变。
 */

/** 核销来自哪种购买：套餐项目或单次购买（DATA_MODEL_V4 第 7 节）。 */
const SOURCE_KIND_BY_PURCHASE_KIND = {
  package: 'package_item',
  single: 'single_purchase',
} as const satisfies Record<string, UsageSourceKind>;

/**
 * 核销的机构选择。与套餐共用判重与复用规则，只是「新机构」不带地点：
 * 核销页没有省市选择器，新机构的地点由这次填的城市文字决定（见下方第 6 步）。
 */
export type RedemptionInstitutionSelection =
  | Exclude<InstitutionSelection, { readonly kind: 'new' }>
  | { readonly kind: 'new'; readonly name: string };

export type CreateRedemptionInput = {
  readonly purchaseItemId: string;
  /** 实际使用人。必填；事务内校验它属于当前档案且仍在使用中 */
  readonly personId: string;
  /** 核销日期，YYYY-MM-DD */
  readonly redeemedOn: BusinessDate;
  readonly institution: RedemptionInstitutionSelection;
  readonly city: string | null;
  readonly notes: string | null;
};

/**
 * 记录一次核销，返回新核销记录的 ID。
 *
 * 有效期不参与这里的判断：套餐过期既不会清零余次，也不会拒绝保存，
 * 提醒发生在界面层的二次确认里（ADR-017、任务书第十节）。
 *
 * 失败时抛 `PurchaseServiceError`（业务原因，文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。
 */
export async function createRedemption(
  dataAccess: DataAccess,
  input: CreateRedemptionInput,
): Promise<string> {
  if (!isBusinessDate(input.redeemedOn)) {
    throw new PurchaseServiceError('核销日期不是一个真实存在的日期');
  }

  const now = new Date().toISOString();
  const city = input.city === null || input.city.trim() === '' ? null : input.city.trim();
  const notes = input.notes === null || input.notes.trim() === '' ? null : input.notes.trim();

  return dataAccess.transaction(async (repositories) => {
    // 1. 事务内重新读取项目。顺带校验它属于当前档案：purchase_items 自己
    //    没有 profile_id，归属只能通过 JOIN 套餐得到。
    const item = await repositories.purchases.findItemContext(
      DEFAULT_PROFILE_ID,
      input.purchaseItemId,
    );
    if (item === null) {
      throw new PurchaseServiceError('这个项目已经不存在了，请返回上一页重新进入');
    }

    // 2. 事务内统计有效核销数，3. 据此算出此刻真实的剩余次数。
    const activeRedemptionCount = await repositories.redemptions.countActiveByItem(item.id);
    const remaining = item.quantity - activeRedemptionCount;

    // 4. 余次不足直接拒绝。这一层是最终防线：界面上的禁用只是提前告知，
    //    真正保证余次不会变成负数的是这里（E-05、任务书第十一节）。
    if (remaining <= 0) {
      throw new PurchaseServiceError('这个项目已经没有剩余次数，无法再记录核销');
    }

    // 5. 使用人。按 (profile_id, id) 在事务内重读：伪造的 ID、其他档案的人与已归档的人
    //    一律拒绝，且发生在写入任何一行（包括变美记录与新机构）之前，不会留下孤立事件。
    //    快照取此刻读到的名称，不信任页面上显示的那一份。
    const person = await repositories.people.findById(DEFAULT_PROFILE_ID, input.personId);
    if (person === null) {
      throw new PurchaseServiceError('选择的使用人已经不存在了，请重新选择使用人');
    }
    if (person.status !== 'active') {
      throw new PurchaseServiceError('选择的使用人已经归档，请重新选择使用人');
    }

    // 6. 创建或复用机构，与新增套餐共用同一套判重规则（ADR-014）。
    //    核销页没有省市选择器：当场新增的机构只有这次填的城市文字（状态 A），与接入省市前一致。
    const institution = await resolveInstitution(
      repositories,
      input.institution.kind === 'new'
        ? { ...input.institution, location: city === null ? null : otherRegionSelection(city) }
        : input.institution,
      now,
    );

    // 7. 变美记录的地点快照。城市文字仍取这次填的城市（没填时取机构的城市）；
    //    省市代码只有在这段文字就是机构自己的城市时才从机构复制——
    //    用户把城市改成了别处，机构上的代码就不再描述这一次（DATA_MODEL_V4 第 5B.9 节）。
    const citySnapshot = city ?? institution?.city ?? null;
    const copyLocation =
      institution !== null && institution.province_code !== null && citySnapshot === institution.city;

    const eventId = createUuid();
    await repositories.redemptions.insertEvent({
      id: eventId,
      profile_id: DEFAULT_PROFILE_ID,
      occurred_on: input.redeemedOn,
      institution_id: institution?.id ?? null,
      institution_name_snapshot: institution?.name ?? null,
      province_code_snapshot: copyLocation ? institution.province_code : null,
      province_name_snapshot: copyLocation ? institution.province_name : null,
      city_code_snapshot: copyLocation ? institution.city_code : null,
      city_name_snapshot: citySnapshot,
      // 备注写在使用记录上，与 v3 → v4 迁移的口径一致。
      notes: null,
      created_at: now,
      updated_at: now,
    });

    // 8. 使用记录的快照写的是**此刻**的项目与套餐名称，之后改名不回写（第 5B.5 节）。
    //    与事件共用同一个 ID：一次快速核销正好一条事件一条使用，这与迁移的口径一致，
    //    历史页的「撤销」也仍然只需要一个标识。
    const serviceName =
      item.service_code === null ? null : (findServiceByCode(item.service_code)?.displayName ?? item.name);
    await repositories.redemptions.insertUsage({
      id: eventId,
      event_id: eventId,
      source_kind: SOURCE_KIND_BY_PURCHASE_KIND[item.purchase_kind],
      purchase_item_id: item.id,
      person_id: person.id,
      person_name_snapshot: person.display_name,
      category_code_snapshot: item.category_code,
      service_code_snapshot: item.service_code,
      service_name_snapshot: serviceName,
      custom_name_snapshot: item.service_code === null ? (item.custom_name ?? item.name) : item.custom_name,
      purchase_name_snapshot: item.purchase_name,
      purchase_item_name_snapshot: item.name,
      status: 'active',
      // 作废字段只有撤销核销时才会写；active 记录必须留空（表级 CHECK 约束）。
      voided_at: null,
      void_reason: null,
      notes,
      created_at: now,
      updated_at: now,
    });

    // 9. 写入后自检。独占事务的连接没有开启外键，这里显式确认
    //    这条事件恰好一条使用、项目的有效使用数没有超过购买次数。
    const usageCount = await repositories.redemptions.countEventUsages(eventId);
    const activeAfter = await repositories.redemptions.countActiveByItem(item.id);
    if (usageCount !== 1 || activeAfter > item.quantity) {
      throw new PurchaseServiceError('这个项目已经没有剩余次数，无法再记录核销');
    }

    const redemptionId = eventId;

    // 10. 任一步抛出异常，整个事务回滚，不会留下半条核销。
    return redemptionId;
  });
}
