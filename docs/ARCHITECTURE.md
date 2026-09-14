# 架构（Architecture）

> **本文件描述目标架构，本轮不实施。**
> 这里记录的是"将来要长成的样子"和"现在就必须遵守的原则"，不代表当前代码已经如此。
> 当前代码仅为 Expo 模板 + 工程基线，尚无业务代码。

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

> 本节描述**目标架构，本轮不实施，也不安装依赖**。决策依据见 [ADR-013](./DECISIONS.md#adr-013-本地持久化使用-expo-sqlite)。

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

## 四、基础数据原则

- 金额按"分"存整数，不使用浮点数
- 业务日期使用 `YYYY-MM-DD`
- `createdAt` 和 `updatedAt` 使用 UTC ISO 时间
- ID 采用客户端或服务端生成的 UUID
- Account 与 Profile 在数据模型中分离；**第一版只有当前用户本人一个 Profile，不提供切换与多人管理**（[ADR-015](./DECISIONS.md#adr-015-第一版只做个人档案不做多人)）
- Purchase、PurchaseItem 和 Redemption 分离
- Institution 为独立实体，购买与核销通过 `institutionId` 关联（[ADR-014](./DECISIONS.md#adr-014-机构作为可复用的独立实体)）
- 剩余次数由购买数量与有效核销记录计算，不能由 UI 随意修改
- 删除策略和审计策略后续单独设计

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

> 仅为规划，本轮**不创建**任何业务目录。目录随功能开发逐步落地。

```
src/
  app/         路由与布局，只放页面文件
  features/    按业务领域组织的功能模块
  components/  跨 feature 复用的展示组件
  services/    网络请求与外部接口封装
  storage/     SQLite 连接、迁移、repository 实现与离线队列
  hooks/       跨 feature 复用的 hooks
  constants/   常量与设计 token
  types/       共享类型定义
  utils/       无副作用的纯函数工具
```

判断代码该放哪里，用一个问题：**它被几个 feature 用？** 只被一个用，就放进那个 feature；被多个用，才提升到顶层目录。
