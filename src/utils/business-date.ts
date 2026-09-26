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

/** 年份上下限对外只读暴露，供月历翻页判断边界，不另写第二份。 */
export { MAX_YEAR as BUSINESS_DATE_MAX_YEAR, MIN_YEAR as BUSINESS_DATE_MIN_YEAR };

const SHAPE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM` 月份键的形状，仅用于格式化标题。 */
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

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

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年某月（1–12）的真实天数；月份越界时为 0。 */
export function daysInMonth(year: number, month: number): number {
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

/** 一天的毫秒数。只用于两个「同为 UTC 中午」的瞬间相减。 */
const MS_PER_DAY = 86_400_000;

/**
 * 把业务日期转成 UTC 当天中午的时间戳。
 *
 * 选中午而不是零点：零点距离时区边界只有一步，任何一点偏移都会落到前后一天；
 * 中午两侧各有 12 小时余量，即便将来换成本地时区构造也不会跨日。
 * 这里只做算术，不读取设备时区，因此同一对日期在任何时区都得到同一个差值。
 */
function toUtcNoonMillis(value: string): number | null {
  const parsed = parseBusinessDate(value);
  if (!parsed.ok) {
    return null;
  }
  const match = SHAPE_PATTERN.exec(parsed.value);
  if (match === null) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/**
 * 两个业务日期相差多少个自然日，`to` 晚于 `from` 时为正。
 *
 * 只数日历上翻过几页，不考虑时刻：`2026-09-18 → 2026-09-19` 恒为 1，
 * 无论设备处在哪个时区、这一天有没有夏令时切换（两端都是 UTC 中午，
 * 夏令时根本不参与运算）。
 *
 * 任一侧不是真实存在的日期时返回 null——返回 0 会被调用方误当成「同一天」，
 * 那比读不出来更糟。
 */
export function differenceInCalendarDays(from: string, to: string): number | null {
  const fromMillis = toUtcNoonMillis(from);
  const toMillis = toUtcNoonMillis(to);
  if (fromMillis === null || toMillis === null) {
    return null;
  }
  // 两端都在 UTC 中午，差值必是整天的整数倍；round 只是防浮点误差。
  return Math.round((toMillis - fromMillis) / MS_PER_DAY);
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

/** 已校验的业务日期拆成年、月（1–12）、日。不合法时返回 null。 */
export function splitBusinessDate(value: string): readonly [number, number, number] | null {
  const parsed = parseBusinessDate(value);
  if (!parsed.ok) {
    return null;
  }
  const match = SHAPE_PATTERN.exec(parsed.value);
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** 年月日拼回 `YYYY-MM-DD`，再走一遍严格校验，拒绝任何被 `Date` 静默滚动的结果。 */
export function joinBusinessDate(year: number, month: number, day: number): string | null {
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = parseBusinessDate(text);
  return parsed.ok ? parsed.value : null;
}

/**
 * 业务日期 → 设备本地当天中午的 `Date`，交给按本地日历工作的原生日期选择器（iOS）。
 *
 * 不用 `new Date('YYYY-MM-DD')`：它按 UTC 零点解析，西半球取本地日期会退一天。
 * 取中午同样是为了远离零点：夏令时切换发生在凌晨，中午两侧各有 12 小时余量。
 */
export function businessDateToLocalDate(value: string): Date | null {
  const parts = splitBusinessDate(value);
  if (parts === null) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

/** 本地日历上的 `Date` → 业务日期。只读本地年月日，不经过 `toISOString()`。 */
export function localDateToBusinessDate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return joinBusinessDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/**
 * 业务日期 → UTC 当天中午的 `Date`。
 *
 * Android 的 Material 3 日期对话框把初始值当作「UTC 日历上的一天」，
 * 本地中午换算成 UTC 后在部分时区会落到相邻的一天，所以单独给一对 UTC 版本，
 * 与本地那一对互不混用。
 */
export function businessDateToUtcDate(value: string): Date | null {
  const millis = toUtcNoonMillis(value);
  return millis === null ? null : new Date(millis);
}

/** UTC 日历上的 `Date` → 业务日期。Android 对话框确认时回传的是所选那天的 UTC 零点。 */
export function utcDateToBusinessDate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return joinBusinessDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/**
 * 业务日期的中文展示，例如 `2026-09-23` → `2026年9月23日`。
 * 纯字符串处理；不是合法日期时原样返回，让调用方至少还能看到原始值。
 */
export function formatBusinessDateLabel(value: string): string {
  const parts = splitBusinessDate(value);
  if (parts === null) {
    return value;
  }
  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
}

/**
 * 取业务日期所属的自然月份键，形如 `2026-09`。
 *
 * 就是截前 7 个字符，**不经过 `Date`**：`new Date('2026-09-01')` 会按 UTC 解析，
 * 在西半球取回本地月份时可能退到 8 月，历史列表就会把 9 月 1 日那条
 * 分到「2026年8月」下面。业务日期没有时刻，也就没有时区可转（任务书第六节）。
 *
 * 形状不对时原样返回：分组键的唯一要求是「同月相同、异月不同」，
 * 与其编一个月份出来，不如让这条异常数据自成一组，仍然可见。
 */
export function businessDateMonthKey(value: string): string {
  return SHAPE_PATTERN.test(value) ? value.slice(0, 7) : value;
}

/**
 * 把月份键格式化为中文标题，例如 `2026-09` → `2026年9月`。
 *
 * 月份去掉前导零，符合中文习惯；同样是纯字符串处理，不做任何时区换算。
 * 不是合法月份键时原样返回，让调用方至少还能看到原始值。
 */
export function formatBusinessMonthLabel(monthKey: string): string {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (match === null) {
    return monthKey;
  }
  return `${match[1]}年${Number(match[2])}月`;
}
