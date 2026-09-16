import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';

import { createDataAccess, type DataAccess } from '@/db';

/**
 * 取得当前连接上的数据访问入口。
 *
 * 这是 UI 与 SQLite 之间**唯一**的接缝：`useSQLiteContext()` 只在这里出现一次，
 * 换出去的是 `DataAccess` 接口。页面与 service 拿到的都是接口，
 * 看不到 `SQLiteDatabase`，也就无从直接执行 SQL（ARCHITECTURE 第三节）。
 *
 * Phase 3 把权威数据源搬到云端时，替换的是这个 hook 返回的实现，页面不动。
 *
 * `DatabaseProvider` 在迁移完成前不渲染任何页面，因此调用到这里时
 * schema 一定已经就绪。
 */
export function useDataAccess(): DataAccess {
  const database = useSQLiteContext();
  // 连接在整个 App 生命周期内稳定，这里缓存是为了让依赖它的 effect
  // 不会因为每次渲染拿到新对象而反复触发。
  return useMemo(() => createDataAccess(database), [database]);
}
