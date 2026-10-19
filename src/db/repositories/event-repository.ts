import type { SQLiteDatabase } from 'expo-sqlite';

import type { BeautyEventRow } from '../types';
import type {
  EventIdCollisionRow,
  EventRepository,
  EventUsageRow,
  EventUsageSummaryRow,
  UsageWithEventRow,
} from './types';

/** 事件与使用记录读回时的完整列，与 `BeautyEventRow` 一一对应。 */
const EVENT_COLUMNS = `id, profile_id, occurred_on, institution_id, institution_name_snapshot,
       province_code_snapshot, province_name_snapshot, city_code_snapshot, city_name_snapshot,
       notes, created_at, updated_at`;

/** 与 `UsageRecordRow` 一一对应，带 `u.` 前缀，供 JOIN 语句使用。 */
const USAGE_COLUMNS = `u.id, u.event_id, u.source_kind, u.purchase_item_id, u.person_id, u.person_name_snapshot,
       u.category_code_snapshot, u.service_code_snapshot, u.service_name_snapshot, u.custom_name_snapshot,
       u.purchase_name_snapshot, u.purchase_item_name_snapshot,
       u.status, u.voided_at, u.void_reason, u.notes, u.created_at, u.updated_at`;

/**
 * `IN (?, ?, …)` 的占位符。SQL 文本里只拼进问号，ID 本身全部走参数绑定。
 * 调用方保证 `count > 0`：空列表直接不查。
 */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * 「记录一次变美」的事件与使用记录读写（BT-0023，DATA_MODEL_V4 第 4.5、4.6、5.4、5.5 节）。
 *
 * 新建时的两条 INSERT 沿用 `RedemptionRepository.insertEvent / insertUsage`，快速核销与完整
 * 流程写的是同一份 SQL。这里补上编辑、删除、修正来源与幂等检查需要的读写。
 *
 * 与其他 repository 一样只负责「怎么读写」：余次够不够、来源合不合法、快照怎么取，
 * 都是 service 的事（ARCHITECTURE 第三节）。
 */
export function createEventRepository(db: SQLiteDatabase): EventRepository {
  return {
    async listEvents(profileId, limit) {
      // 排序显式到 id，不依赖 SQLite 默认顺序（DATA_MODEL_V4 第 9.2 节，BT-0024）。
      // `LIMIT -1` 在 SQLite 中表示不限制，limit 为 null 时用它，语句只有一份。
      return db.getAllAsync<BeautyEventRow>(
        `SELECT ${EVENT_COLUMNS}
           FROM beauty_events
          WHERE profile_id = ?
          ORDER BY occurred_on DESC, created_at DESC, id DESC
          LIMIT ?`,
        [profileId, limit ?? -1],
      );
    },

    async listUsageSummaries(profileId, eventIds) {
      // 一次取齐：变美历史取档案下全部，首页只取最近几条事件的。归属经事件的 profile_id 判断。
      // 按事件、录入时间与 rowid 排序，摘要按「首次出现」的顺序生成时才稳定。
      const columns = `u.id, u.event_id, u.status, u.service_name_snapshot, u.custom_name_snapshot,
              u.purchase_item_name_snapshot`;
      const order = `ORDER BY u.event_id ASC, u.created_at ASC, u.rowid ASC`;
      if (eventIds === null) {
        return db.getAllAsync<EventUsageSummaryRow>(
          `SELECT ${columns}
             FROM usage_records u
             JOIN beauty_events e ON e.id = u.event_id
            WHERE e.profile_id = ?
            ${order}`,
          [profileId],
        );
      }
      if (eventIds.length === 0) {
        return [];
      }
      return db.getAllAsync<EventUsageSummaryRow>(
        `SELECT ${columns}
           FROM usage_records u
           JOIN beauty_events e ON e.id = u.event_id
          WHERE e.profile_id = ? AND u.event_id IN (${placeholders(eventIds.length)})
          ${order}`,
        [profileId, ...eventIds],
      );
    },

    async findEventById(eventId) {
      const row = await db.getFirstAsync<BeautyEventRow>(
        `SELECT ${EVENT_COLUMNS} FROM beauty_events WHERE id = ? LIMIT 1`,
        [eventId],
      );
      return row ?? null;
    },

    async findEvent(profileId, eventId) {
      const row = await db.getFirstAsync<BeautyEventRow>(
        `SELECT ${EVENT_COLUMNS} FROM beauty_events WHERE id = ? AND profile_id = ? LIMIT 1`,
        [eventId, profileId],
      );
      return row ?? null;
    },

    async listEventUsages(eventId) {
      // 购买只用 LEFT JOIN 取跳转与日期提示需要的几列：外部来源、暂不关联与原套餐已删除的
      // 记录没有项目，照样返回。rowid 兜底：同一次保存的几条记录 created_at 完全相同。
      return db.getAllAsync<EventUsageRow>(
        `SELECT ${USAGE_COLUMNS},
                p.id            AS purchase_id,
                p.purchase_kind AS purchase_kind,
                p.purchase_date AS purchase_date,
                p.expires_on    AS expires_on
           FROM usage_records u
           LEFT JOIN purchase_items i ON i.id = u.purchase_item_id
           LEFT JOIN purchases p ON p.id = i.purchase_id
          WHERE u.event_id = ?
          ORDER BY u.created_at ASC, u.rowid ASC`,
        [eventId],
      );
    },

    async updateEvent(row) {
      // ID、档案与创建时间不在 SET 里：编辑永远不换一条事件。
      const result = await db.runAsync(
        `UPDATE beauty_events
            SET occurred_on = ?,
                institution_id = ?,
                institution_name_snapshot = ?,
                province_code_snapshot = ?,
                province_name_snapshot = ?,
                city_code_snapshot = ?,
                city_name_snapshot = ?,
                notes = ?,
                updated_at = ?
          WHERE id = ? AND profile_id = ?`,
        [
          row.occurred_on,
          row.institution_id,
          row.institution_name_snapshot,
          row.province_code_snapshot,
          row.province_name_snapshot,
          row.city_code_snapshot,
          row.city_name_snapshot,
          row.notes,
          row.updated_at,
          row.id,
          row.profile_id,
        ],
      );
      return result.changes;
    },

    async deleteEventUsages(eventId) {
      const result = await db.runAsync(`DELETE FROM usage_records WHERE event_id = ?`, [eventId]);
      return result.changes;
    },

    async deleteEvent(profileId, eventId) {
      const result = await db.runAsync(
        `DELETE FROM beauty_events WHERE id = ? AND profile_id = ?`,
        [eventId, profileId],
      );
      return result.changes;
    },

    async findUsage(profileId, usageId) {
      const row = await db.getFirstAsync<UsageWithEventRow>(
        `SELECT ${USAGE_COLUMNS}, e.occurred_on, e.profile_id
           FROM usage_records u
           JOIN beauty_events e ON e.id = u.event_id
          WHERE u.id = ? AND e.profile_id = ?
          LIMIT 1`,
        [usageId, profileId],
      );
      return row ?? null;
    },

    async updateUsageSource(row) {
      // 只写来源相关的列。`status = 'active'` 内联：已撤销的记录不能修正来源（第 5.5 节）。
      const result = await db.runAsync(
        `UPDATE usage_records
            SET source_kind = ?,
                purchase_item_id = ?,
                purchase_name_snapshot = ?,
                purchase_item_name_snapshot = ?,
                updated_at = ?
          WHERE id = ? AND status = 'active'`,
        [
          row.source_kind,
          row.purchase_item_id,
          row.purchase_name_snapshot,
          row.purchase_item_name_snapshot,
          row.updated_at,
          row.id,
        ],
      );
      return result.changes;
    },

    async countIdCollisions({ purchaseIds, purchaseItemIds, usageIds }) {
      const count = async (table: 'purchases' | 'purchase_items' | 'usage_records', ids: readonly string[]) => {
        if (ids.length === 0) {
          return 0;
        }
        // 表名来自上面的字面量联合类型，不来自调用方。
        const row = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${placeholders(ids.length)})`,
          [...ids],
        );
        return row?.count ?? 0;
      };
      const result: EventIdCollisionRow = {
        purchases: await count('purchases', purchaseIds),
        purchase_items: await count('purchase_items', purchaseItemIds),
        usage_records: await count('usage_records', usageIds),
      };
      return result;
    },
  };
}
