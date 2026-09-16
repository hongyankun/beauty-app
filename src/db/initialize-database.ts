import type { SQLiteDatabase } from 'expo-sqlite';

import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
import { runInTransaction } from './run-in-transaction';
import type { Migration } from './types';

/**
 * 数据库初始化：开启 PRAGMA、读取 schema 版本、按顺序执行未执行的迁移。
 *
 * 这是整个 App 里唯一执行迁移的入口。页面、组件与未来的 repository 都不得
 * 自行建表、改表或推进版本号。
 *
 * 失败一律抛出，不吞掉、不降级、不"假装成功"：
 * 一个 schema 不完整的数据库继续运行只会把问题推迟到写入用户数据的时候。
 */

/** 初始化或迁移失败。错误详情只用于开发期日志，不展示给用户。 */
export class DatabaseInitializationError extends Error {
  /** 失败发生在哪个迁移版本；发生在迁移之外时为 undefined。 */
  readonly migrationVersion: number | undefined;
  /** 原始错误，便于开发期定位；生产 UI 不展示。 */
  readonly originalError: unknown;

  constructor(
    message: string,
    options: { migrationVersion?: number; originalError?: unknown } = {},
  ) {
    super(message);
    this.name = 'DatabaseInitializationError';
    this.migrationVersion = options.migrationVersion;
    this.originalError = options.originalError;
  }
}

/** 读取当前数据库的 schema 版本。全新数据库为 0。 */
async function readSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * 校验迁移列表本身。
 *
 * 版本号必须是从 1 开始、严格递增、不重复的整数。这条规则同时排除了
 * 用随机值或时间戳当版本号的做法——`PRAGMA user_version` 是单调比较的，
 * 乱序版本会导致迁移被跳过或重复执行。
 */
function assertMigrationsAreValid(migrations: readonly Migration[]): void {
  let expected = 1;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version !== expected) {
      throw new DatabaseInitializationError(
        `迁移版本号必须从 1 开始连续递增，发现 ${String(migration.version)}，期望 ${expected}`,
        { migrationVersion: migration.version },
      );
    }
    expected += 1;
  }
}

/**
 * 初始化数据库连接并升级到最新 schema。
 *
 * 作为 `SQLiteProvider` 的 `onInit` 使用，每次打开数据库都会执行；
 * 已经执行过的迁移会被 `user_version` 跳过，重复调用是幂等的。
 */
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  assertMigrationsAreValid(MIGRATIONS);

  // 外键约束是按连接生效的，必须在这条连接上显式开启。
  await db.execAsync('PRAGMA foreign_keys = ON');
  // WAL 写入数据库文件本身，设置一次后持续有效；重复设置无副作用。
  await db.execAsync('PRAGMA journal_mode = WAL');

  const currentVersion = await readSchemaVersion(db);

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    // 用户装过更新版本的 App 又退回旧版。此时绝不能"清理"数据库，
    // 只能如实失败，交由上层提示。
    throw new DatabaseInitializationError(
      `数据库 schema 版本 ${currentVersion} 高于当前 App 支持的 ${LATEST_SCHEMA_VERSION}`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion);

  // 事务边界由 `runInTransaction` 提供。它在原生平台走独占事务，而独占事务跑在
  // 新连接上、不继承上面那句 `PRAGMA foreign_keys`，所以迁移本身不能依赖外键
  // 强制执行——V1 的迁移只有 DDL 和一条固定的默认档案插入，不依赖。
  // 外键在主连接上开启，业务读写走的正是主连接。
  for (const migration of pending) {
    try {
      await runInTransaction(db, async (txn) => {
        await migration.up(txn);
        // PRAGMA 不接受绑定参数，版本号只能内联。它来自本模块校验过的
        // 整数常量，不含任何外部输入。
        await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      // 事务已回滚，user_version 保持迁移前的值，下次启动会重新尝试这条迁移。
      throw new DatabaseInitializationError(
        `数据库迁移 ${migration.version}（${migration.name}）执行失败`,
        { migrationVersion: migration.version, originalError: error },
      );
    }
  }
}
