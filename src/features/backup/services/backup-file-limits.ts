/**
 * 备份文件体积上限，10 MiB。
 *
 * 为什么要有上限：`JSON.parse` 会把整个文件一次性读进内存，一个几百 MB 的
 * 文件足以让 App 在解析途中被系统杀掉——用户看到的是「点一下就闪退」，
 * 而不是任何可理解的提示。上限必须在 `JSON.parse` 之前、在任何事务之前生效
 * （任务书第四节）。
 *
 * 为什么是 10 MiB：这个 App 的备份是纯结构化记录，没有图片与正文。按本地
 * schema 估，一条核销记录序列化后约 300 字节，10 MiB 能装下三万条以上——
 * 远超任何一个个人用户几年积累的量级。定这个数不是为了卡住正常用户，
 * 而是为了在明显不正常的输入上早点停下。
 *
 * 数值固定，不做成设置项：一个能被调大的安全上限等于没有上限。
 */
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;

/**
 * 一段字符串按 UTF-8 编码后的字节数。
 *
 * 用途是**兜底**：文件选择器返回的 `size` 来自系统，不同来源（本机文件、
 * iCloud、第三方网盘的 provider）不保证都给，给了也未必准。所以读完之后
 * 还要按真实内容再量一次，两道都过才进 `JSON.parse`。
 *
 * 不用 `Blob` 或 `TextEncoder` 的原因是它们在 Hermes 上不总是存在；
 * 这里按 UTF-8 规则直接数码位，纯算术，任何环境都能跑，也方便在 Node 里测。
 * 代理对（emoji 这类星际平面字符）按 4 字节计，与 UTF-8 的实际编码一致。
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      // 高代理后面跟着低代理，合起来是一个四字节字符，一次数完并跳过下一个码元。
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
      bytes += 3;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** 体积是否超出上限。`null` 表示来源没给出体积，此时由读取后的实测值判断。 */
export function exceedsBackupSizeLimit(bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > MAX_BACKUP_FILE_BYTES;
}
