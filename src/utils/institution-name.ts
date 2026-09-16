/**
 * 机构名称清洗与判重键。
 *
 * ADR-014：机构由用户自由新增并自动复用，不依赖外部名录。
 * 保存前做**基础**清洗，判重用 `normalized_name`。
 *
 * 清洗刻意保守。合并「協和」与「协和」、去掉括号与后缀之类的激进规范化，
 * 会把用户真正想区分的两家门店合成一家，而 PRD 第 5A.2 节明确写着
 * 「同名机构允许并存，不自动合并」，机构合并是后续能力。
 */

/**
 * 展示与入库用的名称：去除首尾空白，把连续空白合并成一个半角空格。
 *
 * `\s` 覆盖半角空格、制表符与全角空格（U+3000），中文输入法下的误打全角空格也能收敛。
 */
export function cleanInstitutionName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * 判重键：在清洗结果之上只做大小写折叠，用于同一档案内查找已存在的机构。
 *
 * 英文机构名大小写不同视为同一家；其余差异一律视为不同机构。
 */
export function normalizeInstitutionName(raw: string): string {
  return cleanInstitutionName(raw).toLowerCase();
}
