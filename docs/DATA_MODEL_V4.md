# 数据模型 V4 与备份格式 V2（冻结设计）

相关文档：[产品需求](./PRODUCT_REQUIREMENTS.md) · [架构](./ARCHITECTURE.md) · [决策记录](./DECISIONS.md) · [路线图](./ROADMAP.md) · [信息架构](./INFORMATION_ARCHITECTURE.md)

> **状态：已批准，尚未实现。**
>
> 本文件是 schema v4 与备份 `formatVersion` 2 的**唯一规范来源**（BT-0019D 冻结）。
> 其他文档只做摘要并链接到这里，不重复列定义；如有出入，以本文件为准，并先修正本文件再改代码。
>
> 截至本文件写成时，App 实际运行的是 **schema v3** 与**备份 `formatVersion` 1**。
> 本文件描述的表、列、迁移与备份格式**一个都还不存在**，只有 BT-0022 可以把它们落地（第 12 节）。

---

## 1 范围与术语

### 1.1 当前已实现（schema v3 / 备份 v1）

| 项 | 当前事实 |
| --- | --- |
| `PRAGMA user_version` | 3（`LATEST_SCHEMA_VERSION` 由 `MIGRATIONS` 推导） |
| 业务表 | `profiles`、`institutions`、`purchases`、`purchase_items`、`redemption_records`、`wishlist_items`（v2）、`catalog_favorites`（v3） |
| 使用记录 | `redemption_records.purchase_item_id NOT NULL`：一次核销必须属于某个套餐项目 |
| 项目金额 | `purchase_items.unit_amount_minor`（单次分摊金额），项目分摊总额 = 单次 × 次数，派生 |
| 人 | 无使用人、无购买人（ADR-015） |
| 删除套餐 | 物理删除套餐、项目与其下全部核销（ADR-016） |
| 地点 | 纯文本：`institutions.city`、`purchases.city_snapshot`、`redemption_records.city_snapshot` |
| 备份 | `format = 'beauty-app-backup'`，`formatVersion = 1`，含 `redemptionRecords` |

### 1.2 本文件冻结的目标（schema v4 / 备份 v2）

- 真实变美记录（BeautyEvent + UsageRecord）与套餐资产（Purchase + PurchaseItem）**可关联、互相独立**（ADR-020）。
- 删除套餐不再删除真实历史（ADR-021）。
- 引入使用人实体 `people`，购买人与使用人都以「外键 + 名称快照」保存（ADR-022）。
- `allocated_amount_minor` 成为项目金额的唯一事实（ADR-023）。
- 行政区与项目分类是随 App 打包的版本化静态目录，不进用户数据库、不进备份（ADR-024）。
- 机构增加省市代码，成为结构化地点的唯一持有者；变美记录创建时从机构复制地点快照，套餐不另存地点代码（第 4.7 节、ADR-024）。
- 已保存的有效使用记录可以在一个事务内修正来源（第 5.5 节）。
- `redemption_records` 退役，逐行迁入新模型。

### 1.3 三个互相独立的事实

| 事实 | 回答的问题 | 载体 | v4 是否包含 |
| --- | --- | --- | --- |
| 发生了什么 | 哪天、在哪、谁做了哪些项目 | BeautyEvent + UsageRecord | 是 |
| 买了什么、还剩什么 | 资产与余次 | Purchase + PurchaseItem | 是 |
| 以后打算做什么 | 未来意图 | BeautyPlan | **否** |

三者**不得**合并成同一张表上的一个状态字段。心愿单的 `planned_on` 是用户自己记下的日期，**不是** BeautyPlan。BeautyPlan 在 v4 中**不建表，也不建空占位表**，将来以独立任务、独立迁移引入（第 13 节）。

---

## 2 领域关系

```
Profile ─┬─< Person（people）
         ├─< Institution
         ├─< Purchase ──< PurchaseItem
         │     └── purchaser ─> Person
         ├─< BeautyEvent ──< UsageRecord
         │                     ├── person ─> Person
         │                     └── purchase_item ─> PurchaseItem（可空）
         ├─< WishlistItem
         └─< CatalogFavorite
```

- Profile 1:N People / Institutions / Purchases / BeautyEvents / WishlistItems / CatalogFavorites。
- Purchase 1:N PurchaseItem；BeautyEvent 1:N UsageRecord。
- UsageRecord N:1 Person；UsageRecord N:0..1 PurchaseItem。
- Purchase N:1 Person（购买人）。**BeautyEvent 没有人字段**：同一次到店可以是几个人各做各的，人落在每一条 UsageRecord 上。
- Purchase 与 BeautyEvent **之间没有强制关联**：套餐只是某条使用记录**可选的来源**。
- 数据层**从不合并**同名项目、同名套餐或同名机构；「按项目聚合」只发生在展示层（第 9.3 节）。

---

## 3 实体职责

| 实体 | 职责 | 不负责 |
| --- | --- | --- |
| BeautyEvent | 一次真实发生的变美记录：业务日期、机构与地点（均为快照，地点创建时取自机构）、备注 | 不记录人，不记录金额，不记录余次 |
| UsageRecord | 事件中的**一次**项目使用：做的是什么、谁做的、从哪里扣的次数（来源），以及当时的名称快照；纠错只能作废或在有效时修正来源 | 没有数量列：一行就是一次 |
| Purchase | 一次购买：套餐或单次购买、购买人、购买日期、总价、有效期、机构引用与机构名称、城市文字快照 | 不记录「用过几次」，不另存结构化地点 |
| PurchaseItem | 购买中的一个项目资产：分类与项目、当前名称、购买次数、分配金额 | 不保存剩余次数，不是历史快照 |
| Person | 同一档案下被记录的人：「自己」与用户添加的其他人 | 不保存任何敏感个人信息 |
| Institution | 可复用的机构主数据：名称、当前地点（省市代码、省名称、城市显示文字）、归档状态 | 不回写任何历史快照 |

**派生值不落库**：

- `remaining = PurchaseItem.quantity − 该项目 status = 'active' 的 UsageRecord 数`。
- 单次均价 = `allocated_amount_minor ÷ quantity`，不能整除时只作「约」展示（ADR-023）。
- 临期与过期状态、待使用次数、累计投入均为查询时派生。

**快照与当前实体**：带 `_snapshot` 后缀的列记录「当时的样子」，写入后**永不回写**；外键指向「现在的实体」，用于筛选、聚合与跳转。界面展示历史记录时一律使用快照；心愿单的机构名称是唯一刻意展示当前名称的地方（PRD 第 11.2.1 节），v4 不改变这一点。

---

## 4 表定义

下列 DDL 是**规范性的列与约束清单**，BT-0022 可以调整书写格式，但不得增删列、放宽约束或改变语义。日期列沿用现有写法：`GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'` 只挡住明显的格式错误，真实日历校验在 service 与备份 validator 中完成。

### 4.1 未变化的表

`profiles`、`wishlist_items`、`catalog_favorites` 的列、约束与索引**保持 v3 原样**。`institutions` 在 v4 中扩展，见第 4.7 节。

- `wishlist_items.category` 仍使用现有七个分类取值（CHECK 不变）；这七个取值在 v4 中同时是项目目录的一级分类代码（第 8.2 节），因此不需要改表。

### 4.2 `people`（新增）

```sql
CREATE TABLE people (
  id              TEXT    NOT NULL PRIMARY KEY,
  profile_id      TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  display_name    TEXT    NOT NULL CHECK (length(trim(display_name)) > 0),
  normalized_name TEXT    NOT NULL CHECK (length(normalized_name) > 0),
  is_self         INTEGER NOT NULL DEFAULT 0 CHECK (is_self IN (0, 1)),
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  CHECK (is_self = 0 OR status = 'active')
);
CREATE UNIQUE INDEX idx_people_single_self   ON people (profile_id) WHERE is_self = 1;
CREATE UNIQUE INDEX idx_people_profile_name  ON people (profile_id, normalized_name);
```

- 表名是 `people` 而不是 `users`：这里的人不登录、不持有凭证，与 Account 无关（ADR-007、ADR-022）。
- 每个档案**恰好一个** `is_self = 1` 的人，显示名称固定为「自己」。「自己」不可归档、不可删除，v4 范围内也不可改名（改名需先更新 PRD，由 BT-0020 决定）。
- 默认档案的「自己」使用固定 ID 常量（BT-0022 定义，建议 `SELF_PERSON_ID = '00000000-0000-4000-8000-000000000002'`）。**代码查找「自己」一律用 `(profile_id, is_self = 1)`，不得用这个常量**：从备份恢复后，「自己」的 ID 是备份里的那个 ID。
- `normalized_name` 与机构判重使用同一套规则：去首尾空白、连续空白（含全角空格）合并为一个半角空格、英文大小写折叠。判重覆盖使用中与已归档的人，service 在事务内先查一遍，唯一索引是最后一道保护。`people` 是新表，没有历史重名数据，因此可以直接建唯一索引（这与 `institutions` 没有唯一索引的历史原因不同）。
- 其他人可以归档：归档后在历史记录中照常显示，在新建记录的使用人与购买人选择中隐藏。
- **被任何 Purchase 或 UsageRecord 引用的人永远不能物理删除**；从未被引用的人可以删除（BT-0020 定义交互）。
- **不设**手机号、身份证号、生日、性别、关系或任何健康信息字段。

### 4.3 `purchases`（重建）

```sql
CREATE TABLE purchases (
  id                        TEXT    NOT NULL PRIMARY KEY,
  profile_id                TEXT    NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  purchase_kind             TEXT    NOT NULL DEFAULT 'package'
                                    CHECK (purchase_kind IN ('package', 'single')),
  purchaser_person_id       TEXT    NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  purchaser_name_snapshot   TEXT    NOT NULL CHECK (length(trim(purchaser_name_snapshot)) > 0),
  institution_id            TEXT    REFERENCES institutions (id) ON DELETE RESTRICT,
  institution_name_snapshot TEXT,
  city_snapshot             TEXT,
  name                      TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  purchase_date             TEXT    NOT NULL CHECK (purchase_date GLOB '…'),
  total_amount_minor        INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency                  TEXT    NOT NULL DEFAULT 'CNY' CHECK (length(currency) = 3),
  expires_on                TEXT    CHECK (expires_on IS NULL OR expires_on GLOB '…'),
  notes                     TEXT,
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL,
  CHECK (expires_on IS NULL OR expires_on >= purchase_date)
);
```

- 相对 v3 只新增 `purchase_kind`、`purchaser_person_id`、`purchaser_name_snapshot` 三列，其余列原样保留。因为新列带 `NOT NULL` 外键，SQLite 不能用 `ALTER TABLE ADD COLUMN` 添加，所以重建。
- `purchase_kind = 'single'` 的约束见第 7 节。
- 套餐**不另存一套结构化地点**：通过 `institution_id` 引用机构，结构化地点只在机构上（第 4.7 节），v4 不为套餐增加省市代码列。v3 已有的 `city_snapshot` 文本列保留，仍是写入时的城市文字快照：v4 起保存套餐时由所选机构的 `city` 复制，未选机构时为空；套餐表单不再单独输入城市（BT-0019B2）。只有用户在编辑套餐时改选了机构，才按新机构重新复制；机构自身的改名、改地点与归档**不回写**已有套餐。迁移前已有的 `city_snapshot` 原样保留。
- 索引沿用 v3：`idx_purchases_profile_date`、`idx_purchases_institution`、`idx_purchases_profile_expires`，新增 `idx_purchases_purchaser (purchaser_person_id)`。

### 4.4 `purchase_items`（重建）

```sql
CREATE TABLE purchase_items (
  id                     TEXT    NOT NULL PRIMARY KEY,
  purchase_id            TEXT    NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
  name                   TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  category_code          TEXT    NOT NULL CHECK (length(category_code) > 0),
  service_code           TEXT    CHECK (service_code IS NULL OR length(service_code) > 0),
  custom_name            TEXT    CHECK (custom_name IS NULL OR length(trim(custom_name)) > 0),
  quantity               INTEGER NOT NULL CHECK (quantity > 0),
  allocated_amount_minor INTEGER NOT NULL CHECK (allocated_amount_minor >= 0),
  notes                  TEXT,
  created_at             TEXT    NOT NULL,
  updated_at             TEXT    NOT NULL,
  CHECK (service_code IS NOT NULL OR custom_name IS NOT NULL)
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items (purchase_id);
CREATE INDEX idx_purchase_items_service  ON purchase_items (category_code, service_code);
```

- **移除** `unit_amount_minor` 与 `category`；新增 `allocated_amount_minor`、`category_code`、`service_code`、`custom_name`。
- `name` 保留，含义是**套餐项目当前的用户可见名称，可以在安全编辑规则内修改**（编辑套餐时按 ID 原地更新，第 5.3 节）。新建时选自目录则默认为当时的目录显示名，自定义则等于 `custom_name`；之后目录改名不会自动改它，用户编辑时可以改它。**它不是历史快照**：「当时用的是哪个项目」由 UsageRecord 上的 `purchase_item_name_snapshot`、`service_name_snapshot`、`custom_name_snapshot` 等快照列保存（第 4.6 节）。
- `category_code` 必填；`service_code` 与 `custom_name` **至少一个**。两者都有时按 `service_code` 归类，`custom_name` 作为用户自己的叫法展示。
- 分类与项目代码**不在数据库里枚举**（不写 `CHECK … IN (…)`）：目录随 App 版本演进，枚举进 CHECK 意味着每加一个项目都要迁移（ADR-024）。代码是否存在于目录由 service 在写入时校验；数据库中遇到当前目录不认识的代码时按第 8.3 节回退显示。
- 金额规则见第 6 节；项目可删除性沿用 ADR-018 口径，改为以 UsageRecord 为准（第 5.3 节）。

### 4.5 `beauty_events`（新增）

```sql
CREATE TABLE beauty_events (
  id                        TEXT NOT NULL PRIMARY KEY,
  profile_id                TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  occurred_on               TEXT NOT NULL CHECK (occurred_on GLOB '…'),
  institution_id            TEXT REFERENCES institutions (id) ON DELETE RESTRICT,
  institution_name_snapshot TEXT,
  province_code_snapshot    TEXT,
  province_name_snapshot    TEXT,
  city_code_snapshot        TEXT,
  city_name_snapshot        TEXT,
  notes                     TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  CHECK ((province_code_snapshot IS NULL AND province_name_snapshot IS NULL)
      OR (province_code_snapshot IS NOT NULL AND province_name_snapshot IS NOT NULL)),
  CHECK (city_code_snapshot IS NULL
      OR (province_code_snapshot IS NOT NULL AND city_name_snapshot IS NOT NULL))
);
CREATE INDEX idx_beauty_events_profile_date ON beauty_events (profile_id, occurred_on DESC);
CREATE INDEX idx_beauty_events_institution  ON beauty_events (institution_id);
```

- `occurred_on` 是**业务日期** `YYYY-MM-DD`，按设备本地日历理解，**不做 UTC 转换**。
- 机构与地点都可以为空（补录时用户可能记不清）。
- 地点只到**省、市两级**，不设区县。代码为空而名称有值，表示「保留了原始文字但没有映射到目录」（第 10.4 节），或用户选择了「其他地区 / 暂未收录」。
- **地点快照取自机构**：新建事件时，把所选机构当时的 `province_code`、`province_name`、`city_code`、`city` 依次复制到 `province_code_snapshot`、`province_name_snapshot`、`city_code_snapshot`、`city_name_snapshot`；未选机构时四列全为 NULL。事件表单不单独选择省市。用户编辑事件时改选机构，按新机构当时的地点重新复制；只改日期或备注时地点不变。
- 快照写入后**不回写**：机构改名、改地点、归档，以及目录改名，都不影响已存的事件。
- 编辑事件的日期、机构与备注**不改变任何次数**。

### 4.6 `usage_records`（新增）

```sql
CREATE TABLE usage_records (
  id                          TEXT NOT NULL PRIMARY KEY,
  event_id                    TEXT NOT NULL REFERENCES beauty_events (id) ON DELETE CASCADE,
  source_kind                 TEXT NOT NULL CHECK (source_kind IN
                                ('package_item', 'single_purchase', 'external', 'unlinked', 'deleted_package')),
  purchase_item_id            TEXT REFERENCES purchase_items (id) ON DELETE RESTRICT,
  person_id                   TEXT NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  person_name_snapshot        TEXT NOT NULL CHECK (length(trim(person_name_snapshot)) > 0),
  category_code_snapshot      TEXT NOT NULL CHECK (length(category_code_snapshot) > 0),
  service_code_snapshot       TEXT,
  service_name_snapshot       TEXT,
  custom_name_snapshot        TEXT,
  purchase_name_snapshot      TEXT,
  purchase_item_name_snapshot TEXT,
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  voided_at                   TEXT,
  void_reason                 TEXT,
  notes                       TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL,
  CHECK ((status = 'active' AND voided_at IS NULL AND void_reason IS NULL)
      OR (status = 'void'   AND voided_at IS NOT NULL)),
  CHECK ((source_kind IN ('package_item', 'single_purchase') AND purchase_item_id IS NOT NULL)
      OR (source_kind IN ('external', 'unlinked', 'deleted_package') AND purchase_item_id IS NULL)),
  CHECK (service_code_snapshot IS NULL OR service_name_snapshot IS NOT NULL),
  CHECK (service_code_snapshot IS NOT NULL OR custom_name_snapshot IS NOT NULL)
);
CREATE INDEX idx_usage_records_event       ON usage_records (event_id);
CREATE INDEX idx_usage_records_person      ON usage_records (person_id);
CREATE INDEX idx_usage_records_item_status ON usage_records (purchase_item_id, status);
```

- **一行 = 一次使用**，没有数量列。同一事件里同一个人做了两次同一个项目，就是两行。
- 一个事件下的 N 条 UsageRecord 可以各自有不同的项目、来源、使用人与作废状态。
- **作废只发生在这一层**：`status` 从 `active` 改为 `void`，写入 `voided_at` 与可选的 `void_reason`；作废记录**不做单条物理删除**，也不提供单条删除入口。
- `purchase_item_id` 使用 `ON DELETE RESTRICT`：删除套餐项目之前，引用它的使用记录必须已经改为 `deleted_package`（第 5.2 节）。这是最后一道闸，不是业务流程本身。
- 快照列的含义：
  - `person_name_snapshot`：当时使用人的显示名称。
  - `category_code_snapshot` / `service_code_snapshot` / `service_name_snapshot` / `custom_name_snapshot`：当时做的是什么项目。
  - `purchase_name_snapshot` / `purchase_item_name_snapshot`：来源为套餐或单次购买时，当时的套餐名称与项目名称；新建为 `external` 或 `unlinked` 时为空。**套餐被删除后，这两列就是「这次用的是哪张卡」唯一留下的线索**。
- 所有快照在写入时一次性填好，之后**不回写**。编辑套餐名称、项目名称、人名或目录显示名，都不改变已有使用记录的快照。唯一会改写来源快照的是用户对这条记录本身的来源修正，规则见第 5.5 节。

### 4.7 `institutions`（扩展）

在 v3 的 `institutions` 上**追加三列**，其余列、索引与「判重在 service 层、没有唯一索引」的做法不变：

```sql
ALTER TABLE institutions ADD COLUMN province_code TEXT
  CHECK (province_code IS NULL OR length(province_code) > 0);
ALTER TABLE institutions ADD COLUMN province_name TEXT
  CHECK ((province_code IS NULL AND province_name IS NULL)
      OR (province_code IS NOT NULL AND length(trim(province_name)) > 0
          AND city IS NOT NULL AND length(trim(city)) > 0));
ALTER TABLE institutions ADD COLUMN city_code TEXT
  CHECK (city_code IS NULL
      OR (province_code IS NOT NULL AND province_name IS NOT NULL
          AND city IS NOT NULL AND length(trim(city)) > 0));
```

**合法组合只有三种**：

| 状态 | `province_code` | `province_name` | `city_code` | `city` |
| --- | --- | --- | --- | --- |
| A 旧数据 / 其他地区 | NULL | NULL | NULL | 可空；旧原始文字或用户填写的文字 |
| B 省已知、市未收录 | 非空 | 非空白 | NULL | 非空白；城市显示文字 |
| C 标准 | 非空 | 非空白 | 非空 | 非空白；目录中的标准城市名称 |

数据库 CHECK、备份 validator（第 11.4 节）与 service 写入校验**三处都必须拒绝**：

- 有 `province_code`、没有 `province_name`；
- 有 `province_name`、没有 `province_code`；
- 有 `city_code`，但缺 `province_code` 或 `province_name`；
- 任一代码非空，而 `city` 为空或只有空白。

- **追加顺序固定**为 `province_code` → `province_name` → `city_code`：每条 CHECK 只引用已存在的列（`city` 是 v3 原有列，`province_name` 的 CHECK 引用先追加的 `province_code`，`city_code` 的 CHECK 引用前两者）。
- 用「追加列」而不是重建：`institutions` 被 `purchases`、`beauty_events`、`wishlist_items` 引用，重建它在 Web 预览（外键开启）下会触发隐式删除；三列都可为空，`ALTER TABLE ADD COLUMN` 足够。上面的 CHECK 是规范性约束：BT-0022 必须在原生与 Web 两端验证上面四类非法写入都会被拒绝。若任一端的 SQLite 不支持带跨列 CHECK 的追加列，或行为与预期不同，**停止实施并回到文档审阅**，不得去掉或放宽约束，也不得悄悄改为只靠 service 校验。
- **`city` 同时承担三种角色**：当前显示名称；迁移前的旧原始值；选择「其他地区 / 暂未收录」时用户填写的显示文字。它仍是可空的纯文本。
- 取值规则：
  1. 通过静态行政区目录新增或编辑机构时，写入标准的 `province_code`、`province_name`、`city_code`，`city` 写入目录中该城市的标准显示名称。
  2. 只允许上表 A、B、C 三种组合。
  3. 选择「其他地区 / 暂未收录」时，对应层级及其下级的代码为空，`city` 保留用户填写的显示文字：省也未收录为状态 A，省已选、市未收录为状态 B（此时城市文字必填）。
  4. 旧机构只通过显式、精确、唯一的映射补代码（第 10.4 节）；对不上的保留 `city` 原文，三个代码列为 NULL，**不猜测**。
- `province_name` 与 `city` 是机构的**当前**值，不是快照：目录改名不会自动改写它们，用户下次通过选择器保存机构时才更新。
- 机构地点的变化（改名、改地点、归档、恢复）**永不回写**任何 BeautyEvent 的地点快照或 Purchase 的 `city_snapshot`。
- 心愿单继续显示机构当前名称，不因地点字段改变（PRD 第 11.2.1 节）。

---

## 5 `source_kind` 与生命周期

### 5.1 五种来源

| 值 | 用户语言 | `purchase_item_id` | 何时产生 | 是否占用余次 |
| --- | --- | --- | --- | --- |
| `package_item` | 已有套餐 | 必填，指向 `purchase_kind = 'package'` 的项目 | 从某个套餐项目扣一次 | 是（`active` 时） |
| `single_purchase` | 本次单独购买 | 必填，指向 `purchase_kind = 'single'` 的项目 | 同一事务新建单次购买（第 7 节），或再次使用一个仍有余次的单次购买 | 是（`active` 时） |
| `external` | 外部来源 | 必须为空 | 朋友请客、用了别人的卡、活动体验等，不属于用户自己的资产 | 否 |
| `unlinked` | 暂不关联 | 必须为空 | 用户不想或暂时不关联任何来源；补录的历史 | 否 |
| `deleted_package` | 原套餐已删除 | 必须为空 | **只能由删除套餐产生**（第 5.2 节），新建与修正来源时都不能选它作为目标 | 否 |

- 界面上不出现 `source_kind`、`active`、`void` 等技术取值（PRD 第 7.3 节）。
- **关联到购买项目时，`source_kind` 由该项目所属购买的 `purchase_kind` 决定**：`package` → `package_item`，`single` → `single_purchase`，用户不单独选择。所选项目必须属于同一档案，且写入事务内重新计算余次 > 0。
- 已保存使用记录的来源修正见第 5.5 节，schema 不因此变化。
- 套餐过期不禁止选择它作为来源；事件日期晚于有效期时沿用 ADR-017 的二次确认，判断依据是 `occurred_on > expires_on`。

### 5.2 删除套餐（v4 起）

在**一个事务**内按下列顺序执行：

1. 读取影响范围：项目数、引用这些项目的 UsageRecord 数（含已作废）。
2. 把引用该套餐任一项目的全部 UsageRecord（`active` 与 `void` 一视同仁）更新为 `source_kind = 'deleted_package'`、`purchase_item_id = NULL`，刷新 `updated_at`；**所有快照原样保留**，`status`、`voided_at`、`void_reason` 不变。
3. 删除 `purchase_items`，再删除 `purchases`，要求恰好影响 1 行套餐。
4. 事务内自查：不存在 `purchase_item_id` 指向已删除项目的 UsageRecord；受影响事件行数不变。

- BeautyEvent 与 UsageRecord **一条都不删除**；事件的日期、机构、地点与使用人不变。
- 已删除套餐的历史不再计入该套餐的任何资产统计（套餐已经不存在），但仍计入「发生过什么」类的历史与次数统计。
- 确认框必须说明：套餐与项目将被永久删除、不可恢复；**相关的 N 条变美记录会保留**，只是不再关联这个套餐。
- 机构、使用人、购买人都不随套餐删除。
- 单次购买（`single`）也是一条 Purchase，删除规则相同；其使用记录变为 `deleted_package`。

### 5.3 项目删除与次数下限（ADR-018 口径在 v4 的落点）

- 编辑套餐时，项目能否删除以**是否存在任何 UsageRecord**（`active` 或 `void`）为界。
- `quantity` 不得小于该项目 `active` 的 UsageRecord 数，表单层与事务层两层保证。
- 既有项目按 ID 原地更新，禁止「全删再插」。
- `deleted_package` 的使用记录已与项目断开，不再阻止任何项目删除。

### 5.4 删除变美记录

- BeautyEvent 由用户**单独**删除：二次确认、说明不可恢复，并显示将一并删除的使用记录数，以及其中占用套餐次数的有效记录数（这些次数会回到对应套餐）。
- 删除事件会删除其下全部 UsageRecord（含已作废）——这是整条记录被清除，不是单条使用记录的纠错路径，与 ADR-016 对「删除套餐」与「撤销单条核销」的区分同一逻辑。
- 删除事件不影响任何 Purchase、PurchaseItem、Person 与 Institution。

### 5.5 修正已保存使用记录的来源

本节是冻结规则，BT-0023 负责实现，不再重新决定。schema 不变。

**谁能改**

- 只有 `status = 'active'` 的使用记录可以修正来源。
- `status = 'void'` 的使用记录**不能修改来源**：作废历史原样保留；用户如需正确记录，新建一条使用记录。
- 当前来源为 `package_item`、`single_purchase`、`external`、`unlinked`、`deleted_package` 的有效记录都可以修正。`deleted_package` 可以由用户重新关联到一个有效的购买项目，成功后按第 5.1 节变为 `package_item` 或 `single_purchase`。

**可以改成什么**

- 关联到一个购买项目（`package_item` 或 `single_purchase`，由目标购买的 `purchase_kind` 决定）；
- `external`；
- `unlinked`。
- 任何记录都**不能**被改成 `deleted_package`。目标与当前来源完全相同时视为未修改。

**项目一致：修正来源不改变「做了什么」**

来源修正只改「这一次从哪里扣」，**不改这条记录实际做的项目**。目标购买项目必须与这条记录的项目快照兼容：

| 记录的项目快照 | 兼容的目标项目 |
| --- | --- |
| 标准项目（`service_code_snapshot` 非空） | 目标 `service_code` **完全等于** `service_code_snapshot` |
| 自定义项目（`service_code_snapshot` 为空） | 目标 `service_code` 为空，`category_code` 等于 `category_code_snapshot`，且 `custom_name` 与 `custom_name_snapshot` 经项目统一归一化（与机构、人名判重同一规则，第 4.2 节）后**完全相等** |

- 不按显示名称、`name`、`service_name_snapshot` 的相似度匹配，不按目录别名匹配，不做包含、拼音或任何模糊匹配。
- 标准项目与自定义项目之间**永不**因名称相近而视为兼容。
- 界面可以只列出兼容且余次 > 0 的购买项目，但这只是便利；**service 在事务内独立重新校验兼容性**，不信任界面传来的候选。
- 没有任何兼容且余次 > 0 的购买项目时，只能改为 `external` 或 `unlinked`。
- **记错了项目不是来源修正**：作废记录仍不可编辑；有效记录是否支持「修改实际项目」由 BT-0023 单独设计；不得借来源修正把记录关联到另一个项目的购买项目来绕过这一点。

**事务**

在**一个独占事务**内完成：

1. 重新读取这条使用记录，确认它存在且仍为 `active`；否则整体拒绝。
2. 目标为购买项目时，在事务内重新校验：
   - 目标项目仍然存在，其所属购买与这条记录所属事件属于**同一档案**；
   - 目标项目与这条记录的项目快照**兼容**（上文「项目一致」）；
   - 目标项目当前余次 > 0（余次按第 9.1 节派生，这条记录此时尚未指向它）；
   - 事件日期晚于目标购买的有效期（`occurred_on > expires_on`）时，沿用 ADR-017 的二次确认语义：未得到用户确认则拒绝写入；
   - 写入后任何项目的余次都不得为负。
3. 更新 `source_kind`、`purchase_item_id`、`updated_at`；目标为购买项目时，把 `purchase_name_snapshot`、`purchase_item_name_snapshot` 写为**目标购买与项目此刻的名称**。
4. 任何一步失败整体回滚，这条记录保持修正前的样子。

**次数与快照**

- 解除与旧项目的关联后，旧项目的余次**自然恢复**：余次是派生值，没有任何计数需要回退。
- 兼容地重新关联到购买项目时，**只更新来源快照** `purchase_name_snapshot`、`purchase_item_name_snapshot`；**项目快照** `category_code_snapshot`、`service_code_snapshot`、`service_name_snapshot`、`custom_name_snapshot` 保持不变。
- 改为 `external` 或 `unlinked` 会释放本地套餐的次数，但这条记录的**项目历史快照保持不变**：`category_code_snapshot`、`service_code_snapshot`、`service_name_snapshot`、`custom_name_snapshot`，以及 `purchase_name_snapshot`、`purchase_item_name_snapshot` 都不清空。界面只在来源为 `package_item`、`single_purchase`、`deleted_package` 时把后两列作为来源展示。
- 使用人与 `person_name_snapshot`、所属事件、`status` 与作废字段都不因来源修正而改变。
- 来源修正不改变任何 Purchase、PurchaseItem 或 BeautyEvent 行。

---

## 6 金额：`allocated_amount_minor` 是唯一事实

- 每个 PurchaseItem 只保存**分配到该项目的总金额** `allocated_amount_minor`（整数分，≥ 0）。单次金额不落库（ADR-023）。
- 赠送项目的分配金额可以为 0。
- **最终保存时**，同一购买下全部项目的 `allocated_amount_minor` 之和必须**等于** `total_amount_minor`：
  - 编辑过程中允许部分分配，界面显示「已分配 / 待分配」。
  - 分配合计超过总价时阻止保存。
  - 分配合计小于总价时阻止最终保存，提示剩余待分配金额。
- 界面上的单次均价 = `allocated_amount_minor ÷ quantity`，不能整除时标注「约」，**只用于展示，永不回写**。
- 这条等式由 service 层保证，**不写成数据库 CHECK**：跨行求和无法用 CHECK 表达，且迁移后的历史数据可能不平衡（下条）。
- **迁移后的历史不平衡**：v3 允许项目分摊之和与总价不同（PRD-PUR-005）。迁移时 `allocated = unit_amount_minor × quantity` 原样写入，**不自动调整**。「是否平衡」是派生判断，不加列；不平衡的套餐在详情中标注「金额分配与总价不一致」并显示差额，基于分配金额的统计标注为估算值。**任何时候都不自动修改金额**。
- **保存规则**：
  1. 新建套餐：最终保存时分配合计必须等于总价。
  2. 已平衡的套餐：任何编辑后仍必须平衡。
  3. 历史不平衡的套餐：在项目 ID 集合、项目数量、各项目购买次数、各项目分配金额与套餐总价**全部不变**的前提下，只修改下列**元数据**时可以保留原差额保存：
     - 套餐名称
     - 购买日期
     - 有效期
     - 机构
     - 购买人
     - 套餐备注
     - 项目名称
     - 项目分类
     - 项目备注

     项目名称、分类与备注只是套餐项目的当前元数据，修改它们**不回写**任何既有 UsageRecord 的快照（第 4.6 节）。
  4. 历史不平衡的套餐：只要发生下列任一**金额或结构变化**，就必须先补平才能保存——套餐总价变化、任一项目购买次数变化、任一项目分配金额变化、新增项目、删除项目。
- **service 层的最终校验不依赖界面**：在保存事务内读出库中当前的总价与各项目（ID、次数、分配金额），与本次提交逐项比较，判断是否发生上面第 4 条的任一变化。允许保存的条件是：提交后合计等于总价，**或**相对库中当前状态没有发生任何金额或结构变化。已平衡的套餐只能通过金额或结构变化变得不平衡，所以同一条件也保证了第 2 条。
- 单次购买：唯一项目的 `allocated_amount_minor` 等于购买总价。

---

## 7 单次购买

「本次单独购买」在**一个事务**内同时写入：

1. `Purchase(purchase_kind = 'single')`：`purchase_date = occurred_on`，机构与 `city_snapshot` 取自事件所选机构（与事件相同），`expires_on = NULL`，购买人默认「自己」、可修改，`name` 默认取项目显示名称。
2. **恰好一个** `PurchaseItem`：`quantity = 1`，`allocated_amount_minor = total_amount_minor`。
3. 一条 `UsageRecord(source_kind = 'single_purchase')` 指向该项目。

- 用完后（`remaining = 0`）自然退出待使用次数与临期提醒；它没有有效期，本来也不进临期提醒。
- 界面上带「单次」标签。默认不出现在「可用套餐」来源列表中，但在「全部购买」与相关变美记录中始终可见。
- 若其唯一的使用记录被作废，`remaining` 按派生规则回到 1，重新计入待使用次数；用户可以在「全部购买」中找到它并再次使用，新的使用记录来源为 `single_purchase`（第 5.1 节）。
- 「单次购买恰好一个项目且次数为 1」无法用 CHECK 表达，由 service、备份 validator 与迁移自查共同保证。
- 「新建套餐并使用」同样是一个事务：新建 `package` 购买及其项目，并在同一事务内写入事件与 `package_item` 使用记录；任一步失败整体回滚，不留下没有使用记录的新套餐或没有来源的事件。

---

## 8 静态目录（不进数据库、不进备份）

### 8.1 行政区目录（BT-0019B1）

- TypeScript 数据随 App 打包，**运行时不访问网络**，不在用户数据库中建表。
- 条目字段：`code`、`displayName`、`parentCode`、`status`（在用 / 已停用），整份目录带数据来源与版本日期。
- 只收省级与地级两级，不含区县。
- 提供「其他地区 / 暂未收录」兜底条目，供目录中找不到时选择。
- 选择器在新增与编辑机构时使用（含新建套餐、记录一次变美流程中当场新增机构），结果写入 `institutions` 的地点列（第 4.7 节）；事件与套餐不直接使用选择器，地点随机构带出。
- 数据来源与许可由 BT-0019B1 确定，本文件不指定。

### 8.2 项目分类目录（BT-0021A）

- 两级：一级分类 `categoryCode`，二级项目 `serviceCode`；条目字段 `categoryCode`、`serviceCode`、`displayName`、`aliases`、`status`。
- 现有七个分类取值（`light_energy`、`injection`、`chemical_peel`、`mesotherapy`、`cleansing`、`surgery`、`other`）**原样保留为一级分类代码**，可以新增，不得改义或复用。
- 代码**永不复用**；改名只改 `displayName`。
- 停用条目仍能在历史中正常显示，只是不再出现在新建选择中。
- 自定义项目**永不自动聚合**到目录条目，也不与其他自定义项目自动合并。
- 项目目录**不等于**百科：两者不是一一对应，目录条目可以没有百科文章，百科文章也不必对应目录条目。
- 目录只是记录用的分类，不构成医疗建议，也不得声称覆盖全部项目。

### 8.3 回退显示

- 快照优先：历史记录展示快照中的名称，与当前目录无关。
- 数据库中出现当前目录不认识的代码（例如来自更新版本的备份）时，显示对应的名称快照；PurchaseItem 显示 `name`；分类不认识时显示「其他」，**不改写数据**。
- 目录不进备份：备份只携带代码与名称快照。

---

## 9 查询口径

### 9.1 余次与待使用

- `remaining` 只统计 `source_kind IN ('package_item', 'single_purchase') AND status = 'active'` 的使用记录；按 `purchase_item_id` 计数时这一条件自然成立。
- 首页待使用次数、临期提醒剩余次数、套餐详情与记录列表使用同一口径（PRD 第 8.4.1 节不变，只是计数来源从 `redemption_records` 换成 `usage_records`）。

### 9.2 历史

- 变美历史以 BeautyEvent 为单位，按 `occurred_on` 倒序、其次 `created_at` 倒序。
- 事件详情展示其下全部 UsageRecord（含已作废，明确标注）。
- 套餐详情展示当前资产，以及引用它各项目的使用记录（按事件日期倒序）。

### 9.3 项目视图的聚合

- 按 `(category_code, service_code)` 在**展示层**聚合；`service_code` 为空的自定义项目逐条单独显示。
- 聚合只是展示方式：底层每个 PurchaseItem 仍是独立资产，核销时必须落到具体的某一个项目。

---

## 10 v3 → v4 迁移（BT-0022）

### 10.1 总原则

- 一条迁移（version 4），在现有迁移框架的**一个事务**内完成全部 DDL、数据搬运与自查，最后才执行 `PRAGMA user_version = 4`；任何一步失败整体回滚，库保持 v3。
- 不做双写，不保留兼容视图。`redemption_records` 及其 `idx_redemptions_*` 索引在迁移中删除。
- 迁移是 schema 变化的**唯一**入口；备份恢复永远不修改 `user_version`（ADR-019）。

### 10.2 重建顺序

独占事务跑在新连接上、`foreign_keys` 不生效；Web 预览的普通事务则在已开启外键的主连接上运行，`DROP TABLE` 会触发隐式删除与级联。为使两者都安全，按以下顺序：

1. 对 `institutions` 追加三列（第 4.7 节）；新建 `people`、`purchases_v4`、`purchase_items_v4`、`beauty_events`、`usage_records`，新表之间的外键指向 `_v4` 新表名。
2. 搬运数据（第 10.3 节）。
3. 自查（第 10.5 节）。
4. 按子表在前删除旧表：`redemption_records`、`purchase_items`、`purchases`。此时没有任何新表引用旧表，删除不会波及新数据。
5. `purchases_v4 → purchases`、`purchase_items_v4 → purchase_items` 重命名（依赖 SQLite 默认的 `legacy_alter_table = OFF`，它会同步改写其他表中指向被重命名表的外键）。
6. 建立全部索引，再做一次引用完整性自查，最后设置 `user_version = 4`。

### 10.3 数据搬运规则

| 目标 | 规则 |
| --- | --- |
| `people` | 每个档案创建一个「自己」：`is_self = 1`、`status = 'active'`、`display_name = '自己'`；默认档案使用固定 ID，`created_at` 与 `updated_at` 取该档案的 `created_at`，使迁移结果可重现 |
| `institutions` | 原有列与 `updated_at` 全部不变（`city` 原文不改写）；`city` 按第 10.4 节的城市映射命中时补写 `province_code`、`province_name`、`city_code`，否则三列为 NULL |
| `purchases` | 全部列原样复制；`purchase_kind = 'package'`；`purchaser_person_id` 为本档案「自己」；`purchaser_name_snapshot = '自己'` |
| `purchase_items` | ID、`purchase_id`、`name`、`quantity`、`notes`、时间戳原样；`allocated_amount_minor = unit_amount_minor × quantity`；`category_code = category`；`service_code` 与 `custom_name` 见第 10.4 节 |
| `beauty_events` | 每条旧核销生成**一个**事件，`event.id = 旧核销 id`；`occurred_on = redeemed_on`；`institution_id`、`institution_name_snapshot` 原样；地点快照由**旧核销自己的** `city_snapshot` 按第 10.4 节写入（不取机构当前地点：旧快照记录的是那一次的事实）；`notes = NULL`；`created_at`、`updated_at` 取旧核销的对应列 |
| `usage_records` | 每条旧核销生成**一条**使用记录，`usage.id = 旧核销 id`，`event_id` 同值；`source_kind = 'package_item'`，`purchase_item_id` 原样；`person_id` 为「自己」、`person_name_snapshot = '自己'`；`category_code_snapshot` 与项目名称快照取自旧项目（`purchase_item_name_snapshot = 旧 name`，`service_*` 与 `custom_name_snapshot` 同第 10.4 节的项目映射结果）；`purchase_name_snapshot = 旧套餐 name`；`status`、`voided_at`、`void_reason`、`notes`、`created_at`、`updated_at` **原样复制** |

- **不合并**：同一天、同一机构的多条旧核销仍然是多个事件，不猜测它们是不是同一次到店。
- 旧核销的备注放在 UsageRecord 上，事件备注为空——备注原本描述的就是那一次核销。
- `redemption_records` 本身有 `updated_at` 列，因此两张新表的 `updated_at` 直接取旧值，不需要回退到 `created_at`。

### 10.4 映射规则：只用显式映射，不做模糊匹配

- **项目**：只有标准显示名称或经审核并冻结的 legacyExactNames，在归一化后精确且唯一命中时才允许自动映射；普通 aliases 只用于搜索，不参与迁移。具体为：旧 `name` 经与机构判重相同的归一化后，**完全等于**项目目录中某一条的 `displayName` 或某个 `legacyExactNames`，该比较键在**全目录**只属于这一条、该条目为启用状态、且与旧项目属于**同一 `categoryCode`** 时，写入 `service_code`；否则 `service_code = NULL`、`custom_name = 旧 name`，成为自定义项目。不做包含、拼音、错别字或相似度匹配；增删普通别名不改变任何迁移结果。
  - 旧项目默认只能在相同一级分类内，通过标准显示名称或经审核的 legacyExactNames 精确且唯一映射。只有冻结在 legacyCrossCategoryMappings 中的明确历史例外，才允许跨一级分类迁移。首版唯一例外是旧中胚层微针分类下的'射频微针'和'黄金微针'，迁移到光电类射频微针。
  - 匹配顺序固定：先同分类精确匹配 → 落空后查 legacyCrossCategoryMappings（键为「旧分类 + 归一化旧名称」）→ 仍落空则成为自定义项目。白名单条目必须冻结、键唯一、目标启用且与旧分类不同、旧分类不是「其他」，旧名称必须已是目标条目的显示名称或旧名称；白名单只放开分类，不扩大名称，普通别名永远不会借此参与迁移。
  - 白名单用于旧数据库 migration 和 v1 备份升级转换，但不用于 v2 备份的常规恢复或历史快照重校验。legacyCrossCategoryMappings 只属于这次旧数据迁移与复用同一函数的备份 v1 → v2 转换（第 11.3 节），不用于新建、编辑、搜索与用户重新选择。它与普通迁移索引各有一个稳定摘要，审核时据此确认口径没有被改动。
- **城市**：只通过一张显式映射表把旧文本映射到行政区代码（例如「深圳」「深圳市」→ 深圳市，「上海」「上海市」→ 上海市）。旧文本经与机构判重相同的归一化后**完全等于**表中某个键、且**唯一命中**时，得到省代码、省名称与市代码；否则代码为 NULL，不猜省份。旧值为空时全部为 NULL。城市文字本身**一律保留原文**，映射只补代码与省名称。同一张表、同一个函数用于三处：
  - `institutions`：命中时写入 `province_code`、`province_name`、`city_code`，`city` 不改写；
  - 由旧核销生成的 `beauty_events`：命中时写入 `province_code_snapshot`、`province_name_snapshot`、`city_code_snapshot`，`city_name_snapshot` = 旧 `city_snapshot` 原文；未命中时只写 `city_name_snapshot`；
  - `purchases.city_snapshot`：原样保留，不映射（套餐不存地点代码）。
- 两个映射都实现为**纯函数**，由迁移与备份 v1 → v2 转换共用（第 11.3 节），保证同一份旧数据两条路径得到相同结果。

### 10.5 设置 `user_version = 4` 之前的自查

以下任一条不成立即抛出并回滚：

- 每个档案恰好一个 `is_self = 1` 的人。
- `beauty_events` 行数 = `usage_records` 行数 = 旧 `redemption_records` 行数。
- 每个 PurchaseItem 的有效使用记录数 = 迁移前的有效核销数。
- 每条使用记录的 `status`、`voided_at`、`void_reason` 与同 ID 旧核销逐行一致。
- 每个套餐的 `total_amount_minor` 不变；PurchaseItem 的 ID 集合与数量不变；每个项目 `allocated_amount_minor = 旧 unit_amount_minor × quantity`。
- `institutions` 行数、ID 集合以及 `name`、`normalized_name`、`city`、`notes`、`is_archived`、时间戳逐行不变；每行地点代码满足第 4.7 节的完整性约束。
- 无孤儿：项目无套餐、使用记录无事件、使用记录无人、使用记录的 `purchase_item_id` 指向不存在的项目、购买无购买人、事件或购买引用不存在的机构。
- 无跨档案引用：使用记录的人、所属事件、来源项目所属套餐三者档案一致；购买人与购买同档案。

---

## 11 备份格式 v2

### 11.1 版本

- `format` 仍为 `'beauty-app-backup'`；`formatVersion` 1 → 2；`databaseSchemaVersion` 3 → 4。两者由 BT-0022 一起变更，其他任务不得改动。
- 新 App 只导出 v2；**不提供降级导出**。
- 新 App 可恢复 v1 与 v2；旧 App（只认 `formatVersion` 1）读到 v2 时沿用现有提示「这个备份来自更新版本，当前 App 暂时无法恢复。」。
- 版本只看文件内的 `format` 与 `formatVersion`，**永不从文件名推断**。

### 11.2 顶层结构

固定键集合，不接受多余键：

`format`、`formatVersion`、`exportedAt`、`databaseSchemaVersion`、`profile`、`people`、`institutions`、`purchases`、`purchaseItems`、`beautyEvents`、`usageRecords`、`wishlistItems`、`catalogFavorites`

- `redemptionRecords` 在 v2 中**不存在**。
- 每一行的键集合与第 4 节的列完全一致（封闭集合），值原样来自数据库，空值为 JSON `null`。`institutions` 的每一行因此包含 `province_code`、`province_name`、`city_code` 三个键（第 4.7 节）。
- 导出按 `created_at ASC, id ASC` 稳定排序；`purchaseItems` 先按所属购买再按自身；`usageRecords` 先按所属事件再按自身。
- 静态目录、派生值（剩余次数、单次均价、平衡与否）不进备份。

### 11.3 v1 → v2 转换

恢复一份 v1 文件的顺序：

1. 现有 v1 结构与一致性校验（不变）。
2. **纯函数**转换为 v2 文档：规则与第 10.3、10.4 节完全相同（「自己」使用固定 ID 与档案 `created_at`；每条核销 → 一个事件 + 一条使用记录，ID 复用；机构保留 `city` 原文，三个地点代码默认 NULL，只有经与迁移共用的显式映射表命中时才补写；事件地点取自该核销自身的 `city_snapshot`，不取机构当前地点）。转换结果的 `databaseSchemaVersion` 为 4。
3. v2 validator 校验转换结果。
4. 进入恢复事务。

- 项目映射只在第 2 步发生，与迁移使用同一个纯函数（同分类精确匹配 → 跨分类白名单 → 自定义名称），同一份旧数据两条路径结果一致。v2 文件（含刚由 v1 转换得到的文档）里保存的已经是 `category_code`、`service_code` 与名称快照：v2 恢复只校验并原样写回，**不再**运行名称映射或白名单，也不依赖别名、不因快照与当前目录不一致而拒绝或批量改写名称（第 11.4 节）。
- 转换**不修改原文件**，不读写任何其他文件，不把备份内容、用户备注、机构名称或文件路径写入日志。
- 转换或 v2 校验失败时提示「备份内容不完整或存在关联错误。」，数据库一行不变。

### 11.4 v2 validator 在 v1 规则之上新增

- `people` 中恰好一个 `is_self = 1`，其 `status = 'active'`；`normalized_name` 在档案内不重复。
- `people`、`beautyEvents`、`purchases` 的 `profile_id` 都属于文档中的唯一档案。
- `purchases.purchaser_person_id` 指向存在的人；`purchase_kind = 'single'` 的购买恰好一个项目且 `quantity = 1`。
- `purchaseItems`：`allocated_amount_minor` 为非负整数分；`category_code` 非空；`service_code` 与 `custom_name` 至少一个。
- `usageRecords`：`event_id` 存在；`person_id` 存在；`source_kind` 与 `purchase_item_id` 满足第 5.1 节；非空 `purchase_item_id` 指向存在的项目；事件档案、人的档案与来源项目所属购买的档案一致；`single_purchase` 只能指向 `single` 购买的项目，`package_item` 只能指向 `package` 购买的项目；作废字段满足第 4.6 节 CHECK。
- 事件引用的机构存在或为空。
- `institutions` 的地点只允许第 4.7 节的 A、B、C 三种组合：省代码与省名称同时为空或同时非空；`city_code` 非空时省代码与省名称都非空；任一代码非空时 `city` 非空白。`beautyEvents` 的四个地点快照列满足第 4.5 节的同类约束。
- 每个项目的 `active` 使用记录数不超过其 `quantity`。
- 心愿单与收藏的全部现有校验不变。
- 代码字段只校验非空，**不校验是否存在于当前目录**：来自更新目录版本的代码按第 8.3 节回退显示。
- `profile_id` 归一仍集中在 `backup-profile-mapping.ts`，扩展到 `people` 与 `beautyEvents`；人、事件与其他业务 ID 一律原样保留。

### 11.5 恢复事务

- 删除顺序（子表在前）：`catalog_favorites`、`wishlist_items`、`usage_records`、`beauty_events`、`purchase_items`、`purchases`、`people`、`institutions`，档案行 UPSERT。
- 写入顺序：`profile`、`people`、`institutions`（含三个地点列）、`purchases`、`purchase_items`、`beauty_events`、`usage_records`、`wishlist_items`、`catalog_favorites`。
- 事务内自查：各表行数与文档一致；恰好一个「自己」；人、事件、购买属于该档案；使用记录无缺失事件、缺失人、缺失项目，且无事件与来源套餐跨档案；购买、事件、心愿的机构引用有效；心愿与收藏的现有检查全部保留。
- 恢复**永不修改** `user_version`；数据库版本必须已经是 4 才能写入。

---

## 12 实施边界

- **只有 BT-0022** 创建 schema v4 与备份 v2。它之前的任务不得新增迁移；它之后的功能任务（BT-0019C、BT-0020、BT-0019B2、BT-0021B、BT-0023、BT-0024）**只接线、不改表**，不得追加列或新迁移。
- 若后续任务发现本文件遗漏了必需的列，必须停止并先修订本文件与相关 ADR，再由新的 schema 任务处理，不得在功能任务里顺手加列。
- BT-0019B2 的职责不只是放一个选择器：它负责在新增与编辑机构时把标准地点写入 `institutions` 的三个代码列与 `city`，并让新建与编辑套餐复用所选机构的地点（`city_snapshot` 取自机构，表单不再单独输入城市）。「选了省市却不落代码」不算完成。
- BT-0023 负责实现第 5.5 节的来源修正规则，不再重新决定规则。
- BT-0022 之前，PRD 中描述 v3 行为的条款继续有效；v4 上线后，对应条款按 PRD 第 5B 章的目标行为生效。

## 13 不在 v4 范围内

- BeautyPlan 的字段、表结构及其与心愿单的关系（将来独立任务、独立迁移）。
- 最终 Tab 名称与最终路由名。
- 完整的项目目录与完整的行政区数据（分别由 BT-0021A、BT-0019B1 交付首版）。
- 套餐级结构化地点（套餐的地点代码列）、区县级地点。
- 多币种、云同步、登录、会员、照片、AI 推荐、诊断、社区、机构合作、账单 Tab。
- 使用人的敏感个人信息。
