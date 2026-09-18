import {
  DEFAULT_PROFILE_ID,
  type InstitutionRow,
  type RepositoryBundle,
} from '@/db';
import { cleanInstitutionName, normalizeInstitutionName } from '@/utils/institution-name';
import { createUuid } from '@/utils/uuid';
import { PurchaseServiceError } from './errors';

/**
 * 机构选择的共享规则（ADR-014）。
 *
 * 新增套餐与新增核销都要「选已有机构 / 当场新增 / 不填写」这三种方式，
 * 并且判重、清洗与复用的口径必须完全一致——否则同一家店会因为入口不同
 * 被建成两条记录。规则只写在这里一份。
 */

/** 机构的三种选择方式。购买与核销的机构都允许不填（PRD 第 6.1、7.1 节）。 */
export type InstitutionSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'existing'; readonly institutionId: string }
  | { readonly kind: 'new'; readonly name: string };

/**
 * 在事务内把机构选择落成一条真实的机构行。
 *
 * 「新机构」走 ADR-014 的基础清洗 + `normalized_name` 判重：
 * 同一档案内已有同名机构就复用，不重复创建（PRD-INST-002、PRD-INST-003）。
 * 查找与插入都在同一个事务里，两次快速保存同一个新机构不会各插一条。
 *
 * 命中的若是**已归档**的机构，就地把它恢复并复用原来的 ID，而不是新建第二条
 * 同名机构（PRD 第 5A.3 节）：用户重新用起这个名字，本来就意味着它又在用了，
 * 而新建一条会让同一家店的历史被劈成两半。
 *
 * `city` 只在**新建**机构时作为它的城市写入；复用已有机构（含刚恢复的）时
 * 不会去改对方的名称与城市——主数据只在机构管理中心里改。
 *
 * 任何分支都不写 `purchases` 与 `redemption_records` 上的机构快照：
 * 那两份文本由调用方按「这一次购买/核销当时叫什么」单独落库。
 */
export async function resolveInstitution(
  repositories: RepositoryBundle,
  selection: InstitutionSelection,
  city: string | null,
  now: string,
): Promise<InstitutionRow | null> {
  if (selection.kind === 'none') {
    return null;
  }

  if (selection.kind === 'existing') {
    // 独占事务不继承 `PRAGMA foreign_keys`，外键不一定会拦住悬空引用，
    // 所以这里自己查一次，确认机构确实存在且属于当前档案。
    const existing = await repositories.institutions.findById(
      DEFAULT_PROFILE_ID,
      selection.institutionId,
    );
    if (existing === null) {
      throw new PurchaseServiceError('选中的机构已不存在，请重新选择');
    }
    return existing;
  }

  const name = cleanInstitutionName(selection.name);
  if (name === '') {
    throw new PurchaseServiceError('请填写机构名称，或选择不填写机构');
  }

  const normalizedName = normalizeInstitutionName(name);
  const reusable = await repositories.institutions.findByNormalizedName(
    DEFAULT_PROFILE_ID,
    normalizedName,
  );
  if (reusable !== null) {
    return reusable.is_archived === 1 ? await restoreForReuse(repositories, reusable, now) : reusable;
  }

  const created: InstitutionRow = {
    id: createUuid(),
    profile_id: DEFAULT_PROFILE_ID,
    name,
    normalized_name: normalizedName,
    city,
    notes: null,
    is_archived: 0,
    created_at: now,
    updated_at: now,
  };
  await repositories.institutions.insert(created);
  return created;
}

/**
 * 把一条已归档的机构恢复成使用中，并返回恢复后的行。
 *
 * 恢复只动 `is_archived` 与 `updated_at`：ID、创建时间、名称、城市、备注
 * 全部保持原样，历史记录与它的关联自然也一个都不变。
 *
 * 这里不做 `normalized_name` 冲突判断：调用方是按这个键找到它的，
 * 若同档案内还存在一条未归档的同名机构，`findByNormalizedName`
 * 会优先返回那一条，根本不会走到这里。
 */
async function restoreForReuse(
  repositories: RepositoryBundle,
  archived: InstitutionRow,
  now: string,
): Promise<InstitutionRow> {
  const changes = await repositories.institutions.setArchived(
    DEFAULT_PROFILE_ID,
    archived.id,
    1,
    0,
    now,
  );
  if (changes !== 1) {
    // 整件事都在独占事务里，读到归档、写却没落上，说明状态已经不是刚才那个了。
    // 此时不知道新状态是什么，宁可整笔回滚让用户重来，也不猜。
    throw new PurchaseServiceError('机构状态刚刚有变化，请返回重试');
  }
  return { ...archived, is_archived: 0, updated_at: now };
}
