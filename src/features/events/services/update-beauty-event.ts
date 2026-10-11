import { DEFAULT_PROFILE_ID, type BusinessDate, type DataAccess } from '@/db';
import { PurchaseServiceError } from '@/features/purchases/services/errors';
import {
  resolveInstitution,
  type InstitutionSelection,
} from '@/features/purchases/services/institution-selection';
import { isBusinessDate } from '@/utils/business-date';
import { eventInstitutionColumns, optionalNotes, type EventInstitutionColumns } from './usage-snapshots';

/**
 * 编辑变美记录用例（BT-0023 裁决 4，DATA_MODEL_V4 第 4.5 节）。
 *
 * 只改事件自己的三样东西：日期、机构、备注。
 * - 机构没变：机构名称与地点快照**逐字段原样保留**，即使机构后来改了名、改了地点或已归档。
 * - 改选了机构（含清空）：按新机构**此刻**的名称与地点重新复制。
 * - 只改日期或备注：不重算、不改写地点。
 *
 * 任何一条使用记录都不动：使用人、项目与项目快照、来源与备注保存后都不能直接编辑，
 * 记错了就撤销那一条再重新记录（PRD 第 5B.2 节）。这个用例的输入里根本没有这些字段，
 * 也就无从借编辑事件绕过。修改日期、机构与备注不改变任何次数。
 */

export type UpdateBeautyEventInput = {
  readonly eventId: string;
  readonly occurredOn: BusinessDate;
  readonly institution: InstitutionSelection;
  readonly notes: string | null;
};

export async function updateBeautyEvent(
  dataAccess: DataAccess,
  input: UpdateBeautyEventInput,
): Promise<void> {
  if (!isBusinessDate(input.occurredOn)) {
    throw new PurchaseServiceError('日期不是一个真实存在的日期');
  }
  const now = new Date().toISOString();

  await dataAccess.transaction(async (repositories) => {
    // 事务内重读：页面停留期间事件可能已经被删除，或机构已经被改动。
    const event = await repositories.events.findEvent(DEFAULT_PROFILE_ID, input.eventId);
    if (event === null) {
      throw new PurchaseServiceError('这条变美记录已经不存在了，请返回上一页');
    }

    const kept: EventInstitutionColumns = {
      institution_id: event.institution_id,
      institution_name_snapshot: event.institution_name_snapshot,
      province_code_snapshot: event.province_code_snapshot,
      province_name_snapshot: event.province_name_snapshot,
      city_code_snapshot: event.city_code_snapshot,
      city_name_snapshot: event.city_name_snapshot,
    };

    const selection = input.institution;
    let columns: EventInstitutionColumns;
    if (
      (selection.kind === 'existing' && selection.institutionId === event.institution_id) ||
      (selection.kind === 'none' && event.institution_id === null)
    ) {
      // 没有改选机构：一个字都不动。
      columns = kept;
    } else {
      const institution = await resolveInstitution(repositories, selection, now);
      // 按名称当场新增，结果复用到的正是原来那家：同样视为没有改选。
      columns =
        institution !== null && institution.id === event.institution_id
          ? kept
          : eventInstitutionColumns(institution);
    }

    const changes = await repositories.events.updateEvent({
      id: event.id,
      profile_id: DEFAULT_PROFILE_ID,
      occurred_on: input.occurredOn,
      ...columns,
      notes: optionalNotes(input.notes),
      updated_at: now,
    });
    if (changes !== 1) {
      throw new PurchaseServiceError('这条变美记录刚刚有变化，请返回后重试');
    }
  });
}
