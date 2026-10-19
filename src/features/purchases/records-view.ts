/**
 * 记录 Tab 的视图（BT-0024 裁决 2）：套餐、项目、变美历史。
 *
 * 当前视图保存在 `view` 查询参数里，只是导航状态，不参与任何数据库查询。
 * 参数缺失或不认识时一律回到「套餐」。
 */
export type RecordsView = 'package' | 'item' | 'event';

export const RECORDS_VIEWS: readonly { readonly value: RecordsView; readonly label: string }[] = [
  { value: 'package', label: '套餐' },
  { value: 'item', label: '项目' },
  { value: 'event', label: '变美历史' },
];

export const DEFAULT_RECORDS_VIEW: RecordsView = 'package';

/** 把路由参数解析成视图；数组取第一个，缺失或非法时回退到默认视图。 */
export function parseRecordsView(raw: string | readonly string[] | undefined): RecordsView {
  const value = typeof raw === 'string' ? raw : raw?.[0];
  return RECORDS_VIEWS.find((view) => view.value === value)?.value ?? DEFAULT_RECORDS_VIEW;
}
