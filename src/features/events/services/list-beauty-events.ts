import { DEFAULT_PROFILE_ID, type DataAccess } from '@/db';
import { buildEventCards, type BeautyEventCard } from '../event-summary';

/**
 * 变美记录列表（BT-0024）：变美历史读全部，首页「最近变美」读最近几条。
 *
 * 两次查询：一次取事件，一次取这些事件下的全部使用记录，在内存中按 `event_id` 组装，
 * 不为每条事件单独查询（避免 N+1），也不在 SQL 里拼接字符串再解析。
 */
export async function listBeautyEventCards(
  dataAccess: DataAccess,
  limit: number | null,
): Promise<BeautyEventCard[]> {
  const events = await dataAccess.events.listEvents(DEFAULT_PROFILE_ID, limit);
  if (events.length === 0) {
    return [];
  }
  const usages = await dataAccess.events.listUsageSummaries(
    DEFAULT_PROFILE_ID,
    limit === null ? null : events.map((event) => event.id),
  );
  return buildEventCards(events, usages);
}
