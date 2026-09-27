import { DEFAULT_PROFILE_ID } from '@/db';
import type { BackupDocument, BackupDocumentV1 } from './backup-document';

/**
 * 把备份里的档案标识统一改写到本机的固定档案上。
 *
 * 为什么需要改写：`DEFAULT_PROFILE_ID` 是写死的常量（ADR-015：第一版只有
 * 当前用户本人一个档案），而备份里的档案 ID 来自导出它的那台设备。两者**通常**
 * 相同，但不能假定：以后一旦有过任何一次档案 ID 变更，或者用户拿到的是一份
 * 从别处导出的备份，原样写回就会在库里留下第二个档案——App 只读固定 ID 那一个，
 * 于是恢复「成功」了，界面上却一条数据都没有。
 *
 * 为什么集中在这一个纯函数里：任务书要求档案 ID 的映射必须集中、显式、可测试，
 * 不允许散落在界面或 SQL 里。所有 `profile_id` 只在这里被改写一次，
 * 下游拿到的文档已经是「本机口径」，不需要再各自判断一遍。
 *
 * 只改档案 ID。人、套餐、项目、变美记录、使用记录、机构、心愿的业务 ID 与全部时间戳原样保留：
 * 恢复要还原的是那一份数据，重新生成 ID 等于造出一份新的（任务书第三节）。
 *
 * 纯函数，不读数据库、不读时钟。
 */
export function remapToLocalProfile(document: BackupDocument): BackupDocument {
  if (document.profile.id === DEFAULT_PROFILE_ID) {
    // 绝大多数情况走这里：一次对象复制都不做。
    return document;
  }

  const profileId = DEFAULT_PROFILE_ID;
  return {
    ...document,
    profile: { ...document.profile, id: profileId },
    institutions: document.institutions.map((row) => ({ ...row, profile_id: profileId })),
    people: document.people.map((row) => ({ ...row, profile_id: profileId })),
    purchases: document.purchases.map((row) => ({ ...row, profile_id: profileId })),
    beautyEvents: document.beautyEvents.map((row) => ({ ...row, profile_id: profileId })),
    // 套餐项目与使用记录没有 `profile_id` 列，它们的归属顺着
    // `purchase_items → purchases.profile_id` 与 `usage_records → beauty_events.profile_id` 走，
    // 上面几行改完它们就跟着到位了，这里不需要、也不该动它们。
    purchaseItems: document.purchaseItems,
    usageRecords: document.usageRecords,
    wishlistItems: document.wishlistItems.map((row) => ({ ...row, profile_id: profileId })),
    catalogFavorites: document.catalogFavorites.map((row) => ({ ...row, profile_id: profileId })),
  };
}

/**
 * 格式 1 备份的同一件事。
 *
 * 必须在 v1 → v2 转换**之前**做：转换时按档案 ID 生成「自己」的 ID
 * （`selfPersonIdFor`），先归一档案，本机的「自己」才会是固定的 `SELF_PERSON_ID`，
 * 与直接从 v3 升级得到的库一致（DATA_MODEL_V4 第 11.3 节）。
 */
export function remapV1ToLocalProfile(document: BackupDocumentV1): BackupDocumentV1 {
  if (document.profile.id === DEFAULT_PROFILE_ID) {
    return document;
  }

  const profileId = DEFAULT_PROFILE_ID;
  return {
    ...document,
    profile: { ...document.profile, id: profileId },
    institutions: document.institutions.map((row) => ({ ...row, profile_id: profileId })),
    purchases: document.purchases.map((row) => ({ ...row, profile_id: profileId })),
    // 与格式 2 同理：项目与核销的归属顺着套餐走。
    purchaseItems: document.purchaseItems,
    redemptionRecords: document.redemptionRecords,
    wishlistItems: document.wishlistItems.map((row) => ({ ...row, profile_id: profileId })),
    catalogFavorites: document.catalogFavorites.map((row) => ({ ...row, profile_id: profileId })),
  };
}
