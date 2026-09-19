import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';

/**
 * 心愿表单的机构候选项。
 *
 * 心愿表单**只能选已有机构，不能当场新增**（任务书第六节第 1 条），
 * 所以这里不复用套餐表单那个「可搜索 + 当场新增」的选择器数据源，
 * 而是单独给一份明确带归档状态的候选清单。
 */
export type WishlistInstitutionOption = {
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
  /** 已归档的机构不能被新选中，只会因为「原本就关联着」而出现在列表里 */
  readonly isArchived: boolean;
};

/**
 * 列出可供选择的机构，必要时把「原本关联的那家」一并带上。
 *
 * 规则来自任务书第六节第 3、4 条：
 * - 可**新选**的只有使用中的机构；
 * - 编辑一条心愿时，如果它原来关联的机构后来被归档了，那家机构仍然要显示出来，
 *   不能因为归档就把用户填过的关联悄悄清空。此时它带 `isArchived: true`，
 *   界面只把它显示为当前选中项，不作为可新选的候选。
 *
 * 归档机构只在它正是 `linkedInstitutionId` 时才会出现，不会泄漏成一个可选项。
 */
export async function listWishlistInstitutionOptions(
  dataAccess: DataAccess,
  linkedInstitutionId: string | null,
): Promise<WishlistInstitutionOption[]> {
  const selectable = await dataAccess.institutions.listSelectable(DEFAULT_PROFILE_ID);
  const options: WishlistInstitutionOption[] = selectable.map((option) => ({
    id: option.id,
    name: option.name,
    city: option.city,
    isArchived: false,
  }));

  if (linkedInstitutionId === null || options.some((o) => o.id === linkedInstitutionId)) {
    return options;
  }

  // 走到这里说明原关联机构不在「使用中」清单里：它被归档了。
  const linked = await dataAccess.institutions.findById(DEFAULT_PROFILE_ID, linkedInstitutionId);
  if (linked === null) {
    return options;
  }

  return [
    { id: linked.id, name: linked.name, city: linked.city, isArchived: linked.is_archived === 1 },
    ...options,
  ];
}
