/**
 * 备份文件名的生成。纯函数，不碰时钟也不碰文件系统。
 *
 * 形如 `ibeauty-backup-2026-09-19-203045.json`。
 *
 * 几条刻意的取舍：
 *
 * - **用设备本地时间，不用 UTC。** 文件名是给人看的，用户在「文件」里翻的时候
 *   想对上的是「我昨天晚上导的那份」，不是一个要自己换算时区的时间戳。
 *   备份内部的 `exportedAt` 仍然是 UTC ISO，机器读的那一份不受影响。
 * - **不含冒号。** iOS 的「文件」与部分同步盘会把 `:` 当成路径分隔符或直接拒绝。
 * - **不含姓名、机构名与任何记录内容。** 文件名会出现在分享面板、通知与别人的
 *   收件箱里，是这份备份里最容易被旁人看见的一行字（任务书第七节）。
 * - **前缀是产品名，不是备份协议标识。** 用户看到的是 `ibeauty-backup-…`，
 *   而文件内部的 `format` 仍然是 `beauty-app-backup`：前者是给人认的，
 *   后者是给程序认的。改前缀不动协议，旧文件照样能恢复；
 *   恢复流程也从不看文件名，只看文件内容（BT-0018A 第六节）。
 */
const FILE_NAME_PREFIX = 'ibeauty-backup';

export function buildBackupFileName(now: Date): string {
  const parts = [
    pad(now.getFullYear(), 4),
    '-',
    pad(now.getMonth() + 1, 2),
    '-',
    pad(now.getDate(), 2),
    '-',
    pad(now.getHours(), 2),
    pad(now.getMinutes(), 2),
    pad(now.getSeconds(), 2),
  ].join('');

  return `${FILE_NAME_PREFIX}-${parts}.json`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}
