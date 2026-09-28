import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';

/**
 * 购买人 / 使用人选择器的选项。
 *
 * 只列使用中的人，「自己」排第一。已归档的当前值不在这里：
 * 它由表单自己带着（ID + 名称），选择器负责把它照常显示出来（PRD 第 5B.4 节）。
 */
export type PersonOptionView = {
  readonly id: string;
  readonly name: string;
  readonly isSelf: boolean;
};

export type PersonOptionsResult = {
  readonly options: readonly PersonOptionView[];
  /** 「自己」的 ID，新表单的默认值 */
  readonly selfId: string;
  readonly selfName: string;
};

export async function listPersonOptions(dataAccess: DataAccess): Promise<PersonOptionsResult> {
  const rows = await dataAccess.people.listSelectable(DEFAULT_PROFILE_ID);
  const options = rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    isSelf: row.is_self === 1,
  }));
  const self = options.find((option) => option.isSelf);
  if (self === undefined) {
    // 迁移校验保证每个档案恰好一个使用中的「自己」，走到这里说明库已损坏。
    throw new Error('当前档案缺少「自己」');
  }
  return { options, selfId: self.id, selfName: self.name };
}
