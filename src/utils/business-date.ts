/**
 * 业务日期（`YYYY-MM-DD`）。
 *
 * ARCHITECTURE 第四节区分业务日期与时间戳：「哪一天买的」是业务事实，跨时区不应漂移，
 * 所以它是一个日历字符串，不是 UTC 时间戳，也不经过 `Date` 的时区换算。
 *
 * 校验必须落到真实日历，不能只用正则：`2026-02-29` 形状正确但那一天不存在，
 * `2028-02-29` 才存在。这里用闰年规则直接算当月天数，不借道 `new Date()`
 * ——`new Date('2026-02-29')` 会静默滚成 3 月 1 日，用它做校验等于没校验。
 */

/** 可填写的年份下限。早于此几乎一定是误输入。 */
const MIN_YEAR = 1900;
/** 可填写的年份上限。有效期可能填得较远，留足余量。 */
const MAX_YEAR = 2999;

const SHAPE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type BusinessDateParseFailure =
  | 'empty'
  /** 不是 `YYYY-MM-DD` 形状 */
  | 'malformed'
  /** 形状正确但日历上不存在，例如 2026-02-29 */
  | 'not_a_real_date'
  /** 年份超出可填写范围 */
  | 'out_of_range';

export type BusinessDateParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: BusinessDateParseFailure };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/** 严格校验并返回规范化后的业务日期。 */
export function parseBusinessDate(raw: string): BusinessDateParseResult {
  const text = raw.trim();

  if (text === '') {
    return { ok: false, reason: 'empty' };
  }

  const match = SHAPE_PATTERN.exec(text);
  if (match === null) {
    return { ok: false, reason: 'malformed' };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { ok: false, reason: 'out_of_range' };
  }
  if (month < 1 || month > 12) {
    return { ok: false, reason: 'not_a_real_date' };
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, reason: 'not_a_real_date' };
  }

  return { ok: true, value: text };
}

/** 该字符串是否是一个真实存在的 `YYYY-MM-DD` 日期。 */
export function isBusinessDate(value: string): boolean {
  return parseBusinessDate(value).ok;
}

/**
 * 今天的业务日期，取设备本地日历。
 *
 * 不用 `toISOString()`：它先转 UTC，东八区的深夜会变成前一天。
 */
export function todayBusinessDate(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 比较两个业务日期，返回负数 / 0 / 正数。
 *
 * 定长零填充的 `YYYY-MM-DD` 字典序与时间序一致，可以直接比字符串，
 * 这也是数据库里 `expires_on >= purchase_date` 这条 CHECK 成立的原因。
 */
export function compareBusinessDates(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
