/**
 * 金额转换与格式化。
 *
 * ADR-006：金额一律以整数「分」保存，业务逻辑中不出现浮点累计。
 *
 * 转换全程走字符串切分与整数运算，不使用 `parseFloat(text) * 100`：
 * IEEE 754 下 `0.29 * 100 === 28.999999999999996`，四舍五入能掩盖一部分但不是全部，
 * 而金额一旦差 1 分就是错账。
 */

/** 1 元 = 100 分。 */
export const MINOR_UNITS_PER_YUAN = 100;

/**
 * 单笔金额上限 99,999,999.99 元。
 *
 * 不是业务限制，而是输入防呆：超过这个量级几乎一定是误输入，
 * 同时也让「分」始终远在安全整数范围内。
 */
export const MAX_AMOUNT_MINOR = 9_999_999_999;

/** 差额提示阈值：1 元（PRD 第 6.4 节、E-11）。 */
export const ALLOCATION_TOLERANCE_MINOR = 100;

export type AmountParseFailure =
  /** 未填写 */
  | 'empty'
  /** 含非数字字符、多个小数点、科学计数法等 */
  | 'not_a_number'
  /** 负数 */
  | 'negative'
  /** 小数超过两位 */
  | 'too_many_decimals'
  /** 超出可接受量级 */
  | 'out_of_range';

export type AmountParseResult =
  | { readonly ok: true; readonly minor: number }
  | { readonly ok: false; readonly reason: AmountParseFailure };

/** 只接受十进制、最多两位小数的非负金额；不接受千分位、货币符号与科学计数法。 */
const AMOUNT_PATTERN = /^(\d*)(?:\.(\d*))?$/;

/** 把用户输入的「元」文本转成整数「分」。这是写库前唯一允许的金额入口。 */
export function parseYuanToMinor(raw: string): AmountParseResult {
  const text = raw.trim();

  if (text === '') {
    return { ok: false, reason: 'empty' };
  }
  if (text.startsWith('-')) {
    return { ok: false, reason: 'negative' };
  }

  const match = AMOUNT_PATTERN.exec(text);
  if (match === null) {
    return { ok: false, reason: 'not_a_number' };
  }

  const integerPart = match[1] ?? '';
  const fractionPart = match[2];

  // 只有小数点、或空串，都不是合法金额。
  if (integerPart === '' && (fractionPart === undefined || fractionPart === '')) {
    return { ok: false, reason: 'not_a_number' };
  }
  if (fractionPart !== undefined && fractionPart.length > 2) {
    return { ok: false, reason: 'too_many_decimals' };
  }

  const yuan = integerPart === '' ? 0 : Number(integerPart);
  if (!Number.isSafeInteger(yuan)) {
    return { ok: false, reason: 'out_of_range' };
  }

  // '' -> '00'、'3' -> '30'、'30' -> '30'，全部按两位分补齐。
  const minor = yuan * MINOR_UNITS_PER_YUAN + Number((fractionPart ?? '').padEnd(2, '0'));
  if (minor > MAX_AMOUNT_MINOR) {
    return { ok: false, reason: 'out_of_range' };
  }

  return { ok: true, minor };
}

function groupThousands(digits: string): string {
  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    const fromEnd = digits.length - index;
    grouped += digits[index];
    if (fromEnd > 1 && fromEnd % 3 === 1) {
      grouped += ',';
    }
  }
  return grouped;
}

/** 按 UI 基线第 4.1 节的 `¥1,280.00` 格式展示整数分。 */
export function formatMinorAsYuan(minor: number): string {
  const rounded = Math.trunc(minor);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  const yuan = Math.trunc(absolute / MINOR_UNITS_PER_YUAN);
  const cents = absolute % MINOR_UNITS_PER_YUAN;

  return `${sign}¥${groupThousands(String(yuan))}.${String(cents).padStart(2, '0')}`;
}
