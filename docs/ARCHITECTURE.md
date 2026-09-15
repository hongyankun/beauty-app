# 架构（Architecture）

> **本文件描述目标架构，尚未完整实施。**
> 这里记录的是"将来要长成的样子"和"现在就必须遵守的原则"，不代表当前代码已经如此。
> 当前代码处于 R0 骨架阶段：已落地设计 token、共享 UI 组件、五个一级 Tab 的路由骨架，
> 以及本地数据库的连接、版本化迁移与第一版表结构；尚无业务逻辑、repository 与网络层。

相关文档：[项目简介](./PROJECT_BRIEF.md) · [决策记录](./DECISIONS.md) · [路线图](./ROADMAP.md)

---

## 一、移动端

- React Native + Expo + TypeScript
- Expo Router 负责路由
- `src/app` 只放路由和布局
- 业务代码按 feature 组织
- UI 不能直接操作数据库或直接拼接 HTTP 请求
- 网络、存储和业务规则应有独立层

**分层意图**：页面组件只负责渲染和交互，数据从哪来、怎么存、规则怎么算，都在下层。这样后端接入（Phase 3）时，改的是 services 层，不是每个页面。

## 二、未来后端

- NestJS + TypeScript
- PostgreSQL
- Prisma
- REST API + OpenAPI
- 云端数据库为权威数据源
- 手机本地只作为缓存和离线操作队列
- **禁止**采用 localStorage 主数据加全量覆盖同步

最后一条是硬性禁令：全量覆盖同步在多设备场景下会静默丢数据。同步必须基于操作队列，参见 [ADR-005](./DECISIONS.md#adr-005-云端数据库最终作为权威数据源)。

## 三、本地持久化（expo-sqlite）

> 本节的**数据库基础部分已落地**：expo-sqlite 依赖、版本化迁移机制、第一版表结构与数据库 Provider 已实现。
> service、repository 与离线队列**尚未实现**。决策依据见 [ADR-013](./DECISIONS.md#adr-013-本地持久化使用-expo-sqlite)。

核心业务数据使用 **expo-sqlite**，不使用 AsyncStorage 或 JSON 文件作为主存储（轻量偏好设置除外）。第一阶段不引入 ORM。

**分层与依赖方向**（依赖只能自上而下，不得反向）：

```
UI / 页面        只渲染与交互，不知道数据从哪来
    ↓
service / 用例    业务规则、校验、事务边界、派生计算
    ↓
repository       数据访问接口，屏蔽具体存储
    ↓
SQLite           expo-sqlite，表、索引与迁移
```

- **页面不得直接执行 SQL**，也不得直接引用 repository 以下的任何实现。
- service 只依赖 repository **接口**，不依赖 SQLite 实现。
- Phase 3 接入云端时，替换的是 repository 实现与同步逻辑，**页面不需要重写**。这是本分层存在的唯一理由。

**实现约束**：

- 版本化迁移，禁止删库或删表重建升级。
- 初始化时启用外键约束与 WAL。
- 用户输入一律使用参数化查询，禁止字符串拼接 SQL。
- 创建套餐及其项目、核销与撤销核销必须在事务内完成。
- 业务主键使用 UUID 字符串，不使用自增 ID。
- `remaining` 不落库，由 service 层派生。

**已落地的实现**（`src/db/` 与 `src/providers/`）：

| 文件 | 职责 |
| --- | --- |
| `db/constants.ts` | 数据库文件名、默认档案 ID 与显示名、默认币种、项目分类与核销状态取值 |
| `db/types.ts` | 各表的行类型与 `Migration` 类型，属性名与列名一致，不做驼峰转换 |
| `db/migrations.ts` | 全部版本化迁移与其 SQL；`LATEST_SCHEMA_VERSION` 由迁移列表派生 |
| `db/initialize-database.ts` | 唯一的初始化入口：开启 PRAGMA、读取 `user_version`、按序执行未执行的迁移 |
| `db/index.ts` | 数据库层对外出口 |
| `providers/database-provider.tsx` | 打开数据库、触发迁移，并呈现初始化的加载、失败与重试状态 |

**迁移机制**：每条迁移是一个 `{ version, name, up }`，`version` 从 1 开始连续递增。
`initializeDatabase` 只执行 `version` 大于当前 `user_version` 的迁移，每条包在一个事务里
（原生用 `withExclusiveTransactionAsync`，Web 退化为 `withTransactionAsync`），
并在同一事务内推进 `user_version`。任一步失败即整体回滚、版本号不前进、错误向上抛出。
已发布的迁移只读，改 schema 一律追加新版本。

**第一版表结构（migration 1）**：

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `profiles` | `id`、`display_name`、`is_default` | 部分唯一索引保证最多一个默认档案；首次初始化写入唯一一条 |
| `institutions` | `profile_id`、`name`、`normalized_name`、`city`、`notes`、`is_archived` | `notes` 可为空且不建索引；同名机构允许并存，生命周期由归档管理 |
| `purchases` | `profile_id`、`institution_id`、机构与城市快照、`name`、`purchase_date`、`total_amount_minor`、`currency`、`expires_on` | `institution_id` 为 `ON DELETE RESTRICT`；**无软删除列** |
| `purchase_items` | `purchase_id`、`name`、`category`、`quantity`、`unit_amount_minor` | `unit_amount_minor` 为必填整数分且 `>= 0`，0 表示赠送项目；分摊总额 = 单价 × 次数，派生不落库；`purchase_id` 为 `ON DELETE CASCADE` |
| `redemption_records` | `purchase_item_id`、机构与城市快照、`redeemed_on`、`status`、`voided_at`、`void_reason` | `status` 仅 `active` / `void`，表级 CHECK 保证 `void` 必有 `voided_at`；`purchase_item_id` 为 `ON DELETE CASCADE` |

**删除与作废在结构上的体现**：套餐是**永久删除**——没有 `deleted_at`，没有回收站，
删除 `purchases` 一行即经外键级联清除其项目与核销记录，机构与档案不受影响；
单条核销的纠错是**作废**而非删除，记录保留并写入 `voided_at` 与 `void_reason`，
余次只统计 `active`（[ADR-016](./DECISIONS.md#adr-016-套餐永久删除核销记录使用作废机制)）。
**当前只完成了数据库结构**：级联删除靠外键保证，但"删除套餐"的业务操作、
二次确认 UI 与作废流程**尚未实现**。

**尚未进入 schema 的字段**：Account 归属字段延后到账号与云端阶段（Phase 3），
`catalogEntryId` 延后到百科 schema 阶段（Phase 4），两者都通过后续迁移追加，不改 migration 1。

**Provider 职责边界**：`DatabaseProvider` 只负责打开连接、触发迁移与展示初始化状态，
不含任何 SQL；迁移就绪前不渲染任何页面。第一版首次初始化只写入一个默认 Profile，
不生成任何示例业务数据。

**尚未实现**：repository、service 用例、离线操作队列，以及与之相关的业务页面。
第一版**没有任何业务 CRUD 落地**，包括套餐、项目与核销的增删改查。
repository 实现将来落在 `src/db/` 之下，页面仍不得直接执行 SQL。

## 四、基础数据原则

- 金额按"分"存整数，不使用浮点数
- 业务日期使用 `YYYY-MM-DD`
- `createdAt` 和 `updatedAt` 使用 UTC ISO 时间
- ID 采用客户端或服务端生成的 UUID
- Account 与 Profile 在数据模型中分离；**第一版只有当前用户本人一个 Profile，不提供切换与多人管理**（[ADR-015](./DECISIONS.md#adr-015-第一版只做个人档案不做多人)）
- Purchase、PurchaseItem 和 Redemption 分离
- Institution 为独立实体，购买与核销通过 `institutionId` 关联（[ADR-014](./DECISIONS.md#adr-014-机构作为可复用的独立实体)）
- 剩余次数由购买数量与有效核销记录计算，不能由 UI 随意修改
- 项目分摊单价必填（整数分，允许为 0 表示赠送），分摊总额由单价乘次数派生，不落库
- 套餐删除是二次确认后的永久删除并级联；单条核销只作废不物理删除（[ADR-016](./DECISIONS.md#adr-016-套餐永久删除核销记录使用作废机制)）
- 云同步阶段的删除传播（tombstone 或等价机制）需另行设计，不得假设存在软删除列

**为什么区分业务日期和时间戳**：核销发生在"哪一天"是业务事实，跨时区不应漂移；记录被创建在"哪一刻"是系统事实，必须可全局排序。两者语义不同，不能混用同一种表示。

**剩余次数是派生值**，不是存储字段。任何"直接改余次"的实现都是错误的，正确做法是新增或作废一条核销记录。

## 五、安全原则

- 不在客户端保存服务端密钥
- `EXPO_PUBLIC` 变量会进入客户端包，不能放秘密
- 用户只能读取和修改自己的数据
- 默认最小化收集个人信息
- 第一版不收集照片
- 日志不得记录完整敏感信息

医美消费记录属于敏感个人信息。最小化收集不是可选项，是这个品类的前提，参见 [ADR-008](./DECISIONS.md#adr-008-第一版不做照片功能)。

## 六、推荐目录结构

> 目录随功能开发逐步落地，不预先创建空目录。截至当前，已落地 `app/`、`components/`、`db/`、`hooks/`、`providers/`、`theme/`。

```
src/
  app/         路由与布局，只放页面文件
  features/    按业务领域组织的功能模块
  components/  跨 feature 复用的展示组件
  services/    网络请求与外部接口封装
  db/          SQLite 连接常量、版本化迁移与初始化；repository 实现与离线队列将来也放这里
  providers/   跨页面的 React Provider（当前只有数据库 Provider）
  hooks/       跨 feature 复用的 hooks
  theme/       设计 token：颜色、间距、圆角、字体、阴影
  types/       共享类型定义
  utils/       无副作用的纯函数工具
```

设计 token 放在 `theme/`，不放在 `constants/`。视觉语言以 [UI_REFERENCE.md](./UI_REFERENCE.md) 为准，`theme/` 是它在代码中的唯一落地位置，页面与组件不得另写字面量颜色或间距。

`constants/` 只在未来确实出现非视觉常量（如枚举字面量、配置阈值）时才建立，不需要为了保留目录结构预先创建空的 `constants/`。

判断代码该放哪里，用一个问题：**它被几个 feature 用？** 只被一个用，就放进那个 feature；被多个用，才提升到顶层目录。
