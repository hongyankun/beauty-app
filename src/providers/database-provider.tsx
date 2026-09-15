import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FullScreenStatus } from '@/components/ui';
import { DATABASE_NAME, initializeDatabase } from '@/db';
import { Colors } from '@/theme';

type DatabaseStatus = 'loading' | 'ready' | 'error';

export type DatabaseProviderProps = {
  children: ReactNode;
};

/**
 * 本地数据库 Provider。
 *
 * 职责只有三件事：
 * 1. 打开数据库文件（文件名来自 `src/db/constants.ts`，不在此处写字面量）；
 * 2. 在打开后执行版本化迁移（`initializeDatabase`）；
 * 3. 把初始化的加载 / 失败 / 重试状态呈现为符合 Fresh Mint 的整屏状态。
 *
 * 迁移逻辑与 SQL 都在 `src/db/` 里，这里不写任何 SQL。
 * 初始化未完成前不渲染 children，页面因此不可能拿到一个 schema 不完整的连接。
 *
 * 这里用 `SQLiteProvider` 的非 Suspense 模式：Suspense 模式会在模块级缓存
 * 数据库 Promise，失败后的重试会拿回同一个已 reject 的 Promise，「重试」将永远无效。
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [status, setStatus] = useState<DatabaseStatus>('loading');
  // 递增后作为 SQLiteProvider 的 key，强制整棵子树重建，重新走一次打开与迁移。
  const [attempt, setAttempt] = useState(0);

  const handleInit = useCallback(async (database: SQLiteDatabase) => {
    await initializeDatabase(database);
    setStatus('ready');
  }, []);

  const handleError = useCallback((error: Error) => {
    if (__DEV__) {
      // 仅开发期输出。生产 UI 不展示错误堆栈、SQL 与数据库文件路径。
      console.error('[database] 本地数据库初始化失败', error);
    }
    // SQLiteProvider 在自己的 render 阶段调用 onError，此处直接 setState 会触发
    // 「在渲染其他组件时更新本组件」告警，推到微任务里执行。
    void Promise.resolve().then(() => {
      setStatus((previous) => (previous === 'error' ? previous : 'error'));
    });
  }, []);

  const handleRetry = useCallback(() => {
    setStatus('loading');
    setAttempt((previous) => previous + 1);
  }, []);

  if (status === 'error') {
    return (
      <FullScreenStatus
        variant="error"
        title="本地数据暂时无法打开"
        description="这不会删除你已经保存的记录。可以重试，或稍后重新启动 App。"
        actionLabel="重试"
        onActionPress={handleRetry}
      />
    );
  }

  return (
    <View style={styles.root}>
      <SQLiteProvider
        key={attempt}
        databaseName={DATABASE_NAME}
        onInit={handleInit}
        onError={handleError}
      >
        {children}
      </SQLiteProvider>
      {status === 'loading' ? (
        // SQLiteProvider 在初始化完成前渲染 null，所以加载态由这里盖在上面呈现。
        <View style={StyleSheet.absoluteFill}>
          <FullScreenStatus variant="loading" title="正在准备本地数据" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.backgroundWarm,
  },
});
