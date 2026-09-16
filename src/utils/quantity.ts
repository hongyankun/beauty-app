/**
 * 购买次数解析。
 *
 * 购买次数是正整数（PRD 第 6.4 节、PRD-PUR-004）：0、负数与小数都不允许，
 * 因此不能用 `parseInt`——它会把 `'3.7'` 悄悄读成 3，把 `'3 次'` 读成 3。
 */

/** 单个项目的购买次数上限。纯输入防呆，不是业务规则。 */
export const MAX_QUANTITY = 9_999;

export type QuantityParseFailure =
  | 'empty'
  /** 含非数字字符或小数点 */
  | 'not_an_integer'
  /** 0 或负数 */
  | 'not_positive'
  | 'out_of_range';

export type QuantityParseResult =
  | { readonly ok: true; readonly quantity: number }
  | { readonly ok: false; readonly reason: QuantityParseFailure };

export function parseQuantity(raw: string): QuantityParseResult {
  const text = raw.trim();

  if (text === '') {
    return { ok: false, reason: 'empty' };
  }
  if (text.startsWith('-')) {
    return { ok: false, reason: 'not_positive' };
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, reason: 'not_an_integer' };
  }

  const quantity = Number(text);
  if (quantity <= 0) {
    return { ok: false, reason: 'not_positive' };
  }
  if (quantity > MAX_QUANTITY) {
    return { ok: false, reason: 'out_of_range' };
  }

  return { ok: true, quantity };
}
