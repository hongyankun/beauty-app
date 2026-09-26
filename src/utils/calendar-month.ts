/**
 * 月历的纯计算：当月天数、首日星期、6×7 格子、翻月翻年与可选范围。
 *
 * 全部是整数算术，**不经过 `Date`**，因此与设备时区无关：同一组输入在上海、洛杉矶、
 * 檀香山得到逐位相同的结果。日期的解析、拼接与闰年规则一律复用 `./business-date`，
 * 这里不写第二套。
 */

import {
  BUSINESS_DATE_MAX_YEAR,
  BUSINESS_DATE_MIN_YEAR,
  compareBusinessDates,
  daysInMonth,
  joinBusinessDate,
  splitBusinessDate,
} from './business-date';

/** 月历正在显示的年月，月份为 1–12。 */
export type CalendarMonth = {
  readonly year: number;
  readonly month: number;
};

/** 可选范围，两端都是已校验的 `YYYY-MM-DD`；null 表示该侧不限。 */
export type CalendarBounds = {
  readonly min: string | null;
  readonly max: string | null;
};

/** 固定 6 行 7 列：任何月份最多跨 6 周，行数固定可避免翻月时弹层高度跳动。 */
export const CALENDAR_GRID_SIZE = 42;

/** 星期表头，周日在前，与 `firstWeekdayOfMonth` 的 0 = 周日一致。 */
export const CALENDAR_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function isYearInRange(year: number): boolean {
  return year >= BUSINESS_DATE_MIN_YEAR && year <= BUSINESS_DATE_MAX_YEAR;
}

/** 业务日期所在的年月；不合法时为 null。 */
export function monthOfBusinessDate(value: string): CalendarMonth | null {
  const parts = splitBusinessDate(value);
  return parts === null ? null : { year: parts[0], month: parts[1] };
}

/** 两个年月是否是同一个月。 */
export function isSameCalendarMonth(left: CalendarMonth, right: CalendarMonth): boolean {
  return left.year === right.year && left.month === right.month;
}

/**
 * 某月 1 日是星期几，0 = 周日 … 6 = 周六。
 *
 * 用 Sakamoto 公式做纯整数运算：`new Date(y, m, 1).getDay()` 读的是本地时区，
 * 这里不给时区任何参与的机会。
 */
export function firstWeekdayOfMonth(year: number, month: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const raw =
    y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offsets[month - 1] + 1;
  return ((raw % 7) + 7) % 7;
}

/** 42 个格子：当月的日期是 1…N，前后不属于本月的位置是 null（界面上留白）。 */
export function buildMonthGrid(year: number, month: number): readonly (number | null)[] {
  const leading = firstWeekdayOfMonth(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let index = 0; index < CALENDAR_GRID_SIZE; index += 1) {
    const day = index - leading + 1;
    cells.push(day >= 1 && day <= total ? day : null);
  }
  return cells;
}

/** 翻一个月，跨年时进位（12 月 → 次年 1 月，1 月 → 上年 12 月）；越出 1900–2999 时为 null。 */
export function shiftMonth(current: CalendarMonth, delta: 1 | -1): CalendarMonth | null {
  const zeroBased = current.year * 12 + (current.month - 1) + delta;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return isYearInRange(year) ? { year, month } : null;
}

/** 翻一年，月份不变；越出 1900–2999 时为 null。 */
export function shiftYear(current: CalendarMonth, delta: 1 | -1): CalendarMonth | null {
  const year = current.year + delta;
  return isYearInRange(year) ? { year, month: current.month } : null;
}

/** 某一天是否落在可选范围内（两端含）。只比字符串，定长 `YYYY-MM-DD` 的字典序就是时间序。 */
export function isDateWithinBounds(value: string, bounds: CalendarBounds): boolean {
  if (bounds.min !== null && compareBusinessDates(value, bounds.min) < 0) {
    return false;
  }
  return bounds.max === null || compareBusinessDates(value, bounds.max) <= 0;
}

/** 某月至少有一天可选：月末不早于最早日期，且月初不晚于最晚日期。 */
export function monthHasSelectableDay(target: CalendarMonth, bounds: CalendarBounds): boolean {
  const first = joinBusinessDate(target.year, target.month, 1);
  const last = joinBusinessDate(target.year, target.month, daysInMonth(target.year, target.month));
  if (first === null || last === null) {
    return false;
  }
  if (bounds.min !== null && compareBusinessDates(last, bounds.min) < 0) {
    return false;
  }
  return bounds.max === null || compareBusinessDates(first, bounds.max) <= 0;
}

/** 某年至少有一天可选：12 月 31 日不早于最早日期，且 1 月 1 日不晚于最晚日期。 */
export function yearHasSelectableDay(year: number, bounds: CalendarBounds): boolean {
  const first = joinBusinessDate(year, 1, 1);
  const last = joinBusinessDate(year, 12, 31);
  if (first === null || last === null) {
    return false;
  }
  if (bounds.min !== null && compareBusinessDates(last, bounds.min) < 0) {
    return false;
  }
  return bounds.max === null || compareBusinessDates(first, bounds.max) <= 0;
}

/**
 * 「上个月 / 下个月」的目标。目标月一天都不可选（或越出 1900–2999）时为 null，箭头随之禁用。
 * 范围是连续的，所以相邻月不可选就意味着那个方向再往前也不可选，不会出现跳过空月的情况。
 */
export function monthNavigationTarget(
  current: CalendarMonth,
  delta: 1 | -1,
  bounds: CalendarBounds,
): CalendarMonth | null {
  const target = shiftMonth(current, delta);
  return target !== null && monthHasSelectableDay(target, bounds) ? target : null;
}

/**
 * 「上一年 / 下一年」的目标，月份尽量保持不变。
 *
 * 目标年一天都不可选时为 null，箭头禁用。目标年有可选日、但同一个月份整月不可选时
 * （例如最早日期是 2026-09-15，从 2027 年 3 月翻回 2026 年），停在该年最近的可选月份，
 * 而不是让用户落到一整月灰格子里再找路。
 */
export function yearNavigationTarget(
  current: CalendarMonth,
  delta: 1 | -1,
  bounds: CalendarBounds,
): CalendarMonth | null {
  const target = shiftYear(current, delta);
  if (target === null || !yearHasSelectableDay(target.year, bounds)) {
    return null;
  }
  if (monthHasSelectableDay(target, bounds)) {
    return target;
  }
  const minMonth = bounds.min === null ? null : monthOfBusinessDate(bounds.min);
  if (minMonth !== null && minMonth.year === target.year && target.month < minMonth.month) {
    return minMonth;
  }
  const maxMonth = bounds.max === null ? null : monthOfBusinessDate(bounds.max);
  if (maxMonth !== null && maxMonth.year === target.year && target.month > maxMonth.month) {
    return maxMonth;
  }
  return null;
}

/**
 * 打开月历时先显示哪个月：优先显示已选日期所在月；没有已选日期时显示今天所在月，
 * 今天落在可选范围之外时改为显示离它最近的边界所在月。
 */
export function initialCalendarMonth(
  selected: string | null,
  today: string,
  bounds: CalendarBounds,
): CalendarMonth {
  const fromSelected = selected === null ? null : monthOfBusinessDate(selected);
  if (fromSelected !== null) {
    return fromSelected;
  }
  let anchor = today;
  if (bounds.min !== null && compareBusinessDates(anchor, bounds.min) < 0) {
    anchor = bounds.min;
  } else if (bounds.max !== null && compareBusinessDates(anchor, bounds.max) > 0) {
    anchor = bounds.max;
  }
  return monthOfBusinessDate(anchor) ?? { year: BUSINESS_DATE_MIN_YEAR, month: 1 };
}
