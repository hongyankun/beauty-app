/**
 * v3 → v4 迁移的跨一级分类白名单（DATA_MODEL_V4 第 10.4 节）。
 *
 * 旧项目默认只能在相同一级分类内，通过标准显示名称或经审核的 legacyExactNames 精确且唯一映射。
 * 只有冻结在这里的明确历史例外，才允许跨一级分类迁移。
 *
 * 规则（由 `validateServiceCatalog` 检查）：
 *
 * - 只用于 v3 → v4 的一次性旧数据迁移（备份 v1 → v2 转换复用同一函数），不用于新建、编辑、搜索、用户重新选择与 v2 备份的恢复；
 * - 「旧分类 + 归一化旧名称」全局只出现一次；
 * - 旧分类不能是「其他」；
 * - 目标条目存在、在用，且分类与旧分类不同；
 * - 旧名称必须同时是目标条目的 `displayName` 或 `legacyExactNames` 之一：白名单只放开分类，不扩大名称；
 * - 不做包含、拼音、相似度或任何模糊匹配，别名永远不会升级成跨分类映射。
 *
 * 目录第一次提交之后，这里的任何增删改都要升级 `catalogVersion`。
 */

import type { LegacyCrossCategoryMapping } from './types';

function freezeMappings(entries: LegacyCrossCategoryMapping[]): readonly LegacyCrossCategoryMapping[] {
  for (const entry of entries) {
    Object.freeze(entry);
  }
  return Object.freeze(entries);
}

export const LEGACY_CROSS_CATEGORY_MAPPINGS: readonly LegacyCrossCategoryMapping[] = freezeMappings([
  {
    sourceCategoryCode: 'mesotherapy',
    legacyName: '射频微针',
    targetServiceCode: 'radiofrequency_microneedling',
    note: 'v3 用户常把射频微针记在中胚层微针分类下；产品裁决按射频能量归入光电类。',
  },
  {
    sourceCategoryCode: 'mesotherapy',
    legacyName: '黄金微针',
    targetServiceCode: 'radiofrequency_microneedling',
    note: '「黄金微针」是射频微针的市场叫法，理由同上。',
  },
]);
