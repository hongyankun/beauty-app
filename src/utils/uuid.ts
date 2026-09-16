/**
 * 业务主键生成。
 *
 * ADR-013 规定业务主键使用 UUID 字符串而非自增 ID：本地先写、云端后同步时，
 * 自增 ID 会在多设备之间冲突。
 *
 * 不引入第三方 uuid 依赖（ADR-012）。运行时若提供了 WebCrypto 就用它，
 * 否则退回 `Math.random()`。这里生成的是业务记录 ID，不是令牌、不是密钥，
 * 不承担任何安全职责，因此弱随机源在最坏情况下只影响碰撞概率，不构成安全问题。
 */

const HEX = '0123456789abcdef';

/** 读取运行时可能存在的 WebCrypto。原生 Hermes 不保证提供，必须运行时判断。 */
function getRandomValuesSource(): Crypto | null {
  const candidate = (globalThis as unknown as Record<string, unknown>).crypto;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Record<string, unknown>).getRandomValues === 'function'
  ) {
    return candidate as Crypto;
  }
  return null;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const source = getRandomValuesSource();
  if (source !== null) {
    return source.getRandomValues(bytes);
  }
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toHex(byte: number): string {
  return `${HEX[(byte >> 4) & 0x0f]}${HEX[byte & 0x0f]}`;
}

/** 生成 RFC 4122 版本 4 的 UUID，小写带连字符。 */
export function createUuid(): string {
  const bytes = randomBytes(16);
  // 第 7 字节高 4 位固定为版本号 4，第 9 字节高 2 位固定为变体 10xx。
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
