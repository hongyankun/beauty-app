import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { PurchaseServiceError } from './errors';

/**
 * 撤销一次核销用例。
 *
 * 撤销**不删除记录**：它把 `status` 从 active 改成 void，记录连同原核销日期
 * 与机构快照一起留在历史里（ADR-016、PRD-RED-011）。余次跟着恢复，
 * 是因为余次本来就是「购买次数 − 有效核销数」这个派生式的结果，
 * 这里没有任何一列 remaining 被加回去（ARCHITECTURE 第四节）。
 *
 * 界面上统一说「撤销核销 / 已撤销」，`void` 只出现在数据库里（PRD-RED-010）。
 */

export type VoidRedemptionInput = {
  readonly redemptionId: string;
  /** 用户填写的撤销原因；选填。空白视同未填写 */
  readonly reason: string | null;
};

/** 已经撤销过的记录再撤一次的统一说法。余次绝不能因此再涨一次。 */
const ALREADY_VOID_MESSAGE = '这条核销记录已经撤销，剩余次数不会重复恢复';

/**
 * 规范化撤销原因：去除首尾空格，只剩空白时写 null。
 *
 * 不填就是不填——不编造「用户撤销」这类默认原因，那会让审计字段
 * 看起来人人都写了理由，实际上一句真话都没有（任务书第四节）。
 */
function normalizeReason(reason: string | null): string | null {
  if (reason === null) {
    return null;
  }
  const trimmed = reason.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 把一条有效核销改为已撤销。
 *
 * 失败时抛 `PurchaseServiceError`（文案可直接展示）或原始异常
 * （存储层故障，由调用方用兜底文案兜住）。
 */
export async function voidRedemption(
  dataAccess: DataAccess,
  input: VoidRedemptionInput,
): Promise<void> {
  const now = new Date().toISOString();
  const reason = normalizeReason(input.reason);

  await dataAccess.transaction(async (repositories) => {
    // 1. 事务内读取记录，同时校验它属于当前档案。
    const record = await repositories.redemptions.findById(
      DEFAULT_PROFILE_ID,
      input.redemptionId,
    );
    if (record === null) {
      throw new PurchaseServiceError('这条核销记录已经不存在了，请返回上一页重新进入');
    }

    // 2. 先判断状态，好让「已经撤销过」得到一句准确的说明而不是笼统的失败。
    if (record.status !== 'active') {
      throw new PurchaseServiceError(ALREADY_VOID_MESSAGE);
    }

    // 3. 真正的防线是这句条件更新。上面的判断与它之间即便只隔一瞬，
    //    也只有 `WHERE status = 'active'` 能保证第二次撤销改不到任何一行。
    const changed = await repositories.redemptions.voidById(input.redemptionId, now, reason);

    // 4. 行数必须正好是 1。0 表示这条记录在读与写之间已经被撤销，
    //    此时抛出使整个事务回滚，余次不会被恢复第二次（任务书第六节）。
    if (changed !== 1) {
      throw new PurchaseServiceError(ALREADY_VOID_MESSAGE);
    }
  });
}
