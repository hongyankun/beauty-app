import { formatTimestampAsLocalMinute } from '@/utils/timestamp';
import type { BackupDocument } from '../backup-document';

/**
 * 确认覆盖之前给用户看的那份摘要。
 *
 * 它回答的是同一个问题的两半：「这份备份是什么时候的」和「里面有多少东西」。
 * 用户要凭这两点判断自己选对了文件——挑错备份是这个流程里最容易犯、
 * 后果也最重的错，而一旦确认覆盖，App 内就没有撤销了（任务书第七节）。
 *
 * 全部数字都**直接数数组长度**，不另存一份计数、也不从别处推算：
 * 同一个事实在文件里出现两遍，只会在两者对不上时多一个需要判断真伪的地方
 * （PRD 第 15.2.3 节）。
 *
 * 摘要里没有任何一条具体记录：不出现套餐名、机构名与备注。
 * 用户此刻要判断的是「哪一份备份」，不是逐条核对内容；
 * 何况这一屏随时可能被人从背后看见。
 */
export type BackupSummary = {
  /** 备份生成时间，已按设备本地时区格式化到分钟；无法解析时为 null。 */
  readonly exportedAtLabel: string | null;
  /** 备份格式版本。与数据库 schema 版本是两回事，两者都不是 App 版本号。 */
  readonly formatVersion: number;
  readonly purchaseCount: number;
  readonly purchaseItemCount: number;
  readonly redemptionCount: number;
  readonly institutionCount: number;
  readonly wishlistCount: number;
  readonly favoriteCount: number;
};

/** 从一份已经校验过的备份里数出摘要。纯函数。 */
export function summarizeBackupDocument(document: BackupDocument): BackupSummary {
  return {
    exportedAtLabel: formatTimestampAsLocalMinute(document.exportedAt),
    formatVersion: document.formatVersion,
    purchaseCount: document.purchases.length,
    purchaseItemCount: document.purchaseItems.length,
    redemptionCount: document.redemptionRecords.length,
    institutionCount: document.institutions.length,
    wishlistCount: document.wishlistItems.length,
    favoriteCount: document.catalogFavorites.length,
  };
}
