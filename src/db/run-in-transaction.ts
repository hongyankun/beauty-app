import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

/**
 * 在一个 SQLite 事务中执行一段工作，失败整体回滚。
 *
 * 原生平台使用 `withExclusiveTransactionAsync`：它在一条独占连接上执行，
 * 事务期间不会有范围外的 SQL 混进同一个事务。
 *
 * Web 上 expo-sqlite 明确不支持该 API（会直接抛错），而 Web 只是开发期辅助
 * 预览、不是 V1 发布平台（ADR-003），因此退化为 `withTransactionAsync`：
 * 同样有 BEGIN / COMMIT / ROLLBACK 保护，只是不独占连接。
 *
 * 注意：独占事务跑在新连接上，`PRAGMA foreign_keys` 不会从主连接继承，
 * 而进入 BEGIN 之后再设置该 PRAGMA 是静默无效的。因此事务内的逻辑
 * **不得把外键当作最后一道校验**，需要引用完整性时要自己在事务里查一次。
 *
 * `withExclusiveTransactionAsync` 的回调签名固定返回 `Promise<void>`，
 * 这里用一个中转盒子把结果带出来，让调用方能直接拿到事务的返回值。
 */
export async function runInTransaction<T>(
  db: SQLiteDatabase,
  task: (txn: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  let box: { readonly value: T } | null = null;

  const run = async (txn: SQLiteDatabase): Promise<void> => {
    box = { value: await task(txn) };
  };

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => run(db));
  } else {
    await db.withExclusiveTransactionAsync(run);
  }

  if (box === null) {
    // 事务已提交却没拿到结果，说明 expo-sqlite 的回调没有被 await。
    // 这是实现层面的错误，不能当成业务失败静默吞掉。
    throw new Error('事务已结束但没有返回结果');
  }
  return (box as { readonly value: T }).value;
}
