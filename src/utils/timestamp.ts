/**
 * UTC 时间戳的展示格式化。
 *
 * 与 `business-date.ts` 分工明确：业务日期回答「哪一天做的」，跨时区不换算；
 * 这里处理的是系统时间戳（`created_at`、`voided_at`），它记录的是「什么时刻
 * 发生的操作」，展示时需要落到用户所在时区。
 *
 * 不用 `toLocaleString`：各平台与各语言环境的输出格式不一致，
 * 而界面上这一列要和业务日期的 `YYYY-MM-DD` 排在一起看。
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 把 UTC ISO 时间戳格式化为本地时区的「YYYY-MM-DD HH:mm」。
 *
 * 解析不出来时返回 null，由调用方决定是整行不显示还是换一句说明——
 * 界面上不出现 `Invalid Date`。
 */
export function formatTimestampAsLocalMinute(timestamp: string): string | null {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const date = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return `${date} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
