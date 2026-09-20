import { BackupScreen } from '@/features/backup/screens/backup-screen';

/**
 * 路由 `/(tabs)/me/backup`：数据备份。
 *
 * 压在「我的」Tab 自己的栈里，保留底部 Tab 栏，返回回到「我的」
 * （IA 第 3.5.4、4.3 节第 2 条）。
 *
 * `src/app` 只放路由（ARCHITECTURE 第六节），页面实现在 feature 里。
 */
export default function BackupRoute() {
  return <BackupScreen />;
}
