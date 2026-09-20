/**
 * 导出与恢复之间的互斥闸门。
 *
 * 为什么需要它：导出全程只读，恢复会先把当前档案清空再写回。两件事同时跑，
 * 导出读到的就是一个删了一半的库——它还会通过自检（那份数据内部是自洽的），
 * 于是用户拿到一份「合法但内容缺一半」的备份。这比直接失败糟得多
 * （任务书第十节）。
 *
 * 闸门是**模块级**的同步变量，不是 React state，原因有两条：
 *
 * 1. `setState` 是异步的。用户在同一帧里连点两下，第二下读到的还是旧值，
 *    只有同步赋值能当场把它挡回去。任务书明确不接受「只依赖异步 setState
 *    作为并发锁」。
 * 2. 导出与恢复是两个 hook、两份 state。只有放在两者之外的地方，
 *    它们才互相看得见。
 *
 * 放在模块作用域也意味着它跨页面存活：用户在导出进行中离开备份页、
 * 从别处再进来点恢复，一样会被挡住。这正是我们要的——真正冲突的是
 * 那个数据库，不是那一屏。
 *
 * 纯 TypeScript，不依赖 React 与任何原生模块，因此 Node 里能直接测。
 */

export type BackupTask = 'export' | 'restore';

let current: BackupTask | null = null;

/**
 * 尝试占用闸门。拿到返回 `true`，已被占用返回 `false`。
 *
 * 调用方拿到 `false` 时应当**安静地什么都不做**：这种情况只会出现在
 * 连点或误触，弹一句「请稍候」只是在为一次本就不该发生的点击道歉。
 */
export function tryAcquireBackupTask(task: BackupTask): boolean {
  if (current !== null) {
    return false;
  }
  current = task;
  return true;
}

/**
 * 释放闸门。
 *
 * 带上 `task` 是防呆：只有当前占用者能释放它。没有这层判断的话，
 * 一次迟到的清理就可能把另一个任务的锁解开。
 *
 * 必须放在 `finally` 里——失败路径不释放，App 会一直卡在「什么都点不动」。
 */
export function releaseBackupTask(task: BackupTask): void {
  if (current === task) {
    current = null;
  }
}

/** 当前是否有备份任务在跑。只用于测试与断言，界面状态仍由各自的 hook 管。 */
export function isBackupTaskRunning(): boolean {
  return current !== null;
}
