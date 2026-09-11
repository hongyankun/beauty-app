@AGENTS.md

# 项目上下文

这是一款面向个人消费者的轻医美记录、套餐资产管理与中立科普 App。

动手前请阅读与任务相关的文档：

- [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) —— 产品定义、核心用户、MVP 模块、明确不做的事、AI 能力红线
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 目标架构、分层原则、数据与安全原则、目录规划
- [docs/DECISIONS.md](docs/DECISIONS.md) —— 已确定的架构决策（ADR），不得随意推翻
- [docs/ROADMAP.md](docs/ROADMAP.md) —— 阶段划分与待决策项
- [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) —— 产品需求基线、业务规则、验收标准（PRD-XXX-NNN）、未决问题
- [docs/INFORMATION_ARCHITECTURE.md](docs/INFORMATION_ARCHITECTURE.md) —— 页面树、页面清单与 Expo Router 路由规划

@docs/PRODUCT_REQUIREMENTS.md
@docs/INFORMATION_ARCHITECTURE.md

# 执行规则

## 任务流程

1. 每次只处理一个有编号的任务。
2. 开始前检查 `git status`。
3. 开始前阅读与任务相关的项目文档。
4. 修改前先输出计划和预计修改文件。
5. 不修改任务范围外的文件。

## 变更约束

6. 未经允许不增加依赖。
7. 未经允许不改变架构决策。
8. 不执行 `npm audit fix --force`。

## 安全

9. 不硬编码密钥。
10. 不在 `EXPO_PUBLIC` 变量中存储秘密。
11. 不自动 commit 或 push。

## 验证与交付

12. 完成后运行 `npm run lint` 和 `npx tsc --noEmit`。
13. 涉及 Expo 配置或依赖时运行 `npx expo-doctor`。
14. 完成后输出修改文件、验证结果、人工测试步骤和 `git status`。
15. 如果需求与 [docs/DECISIONS.md](docs/DECISIONS.md) 冲突，停止并提出问题。

## 产品红线

16. 所有用户可见文字默认使用简体中文。
17. 不把 AI 描述为医生，不输出诊断或治疗承诺。
18. 第一版不得引入照片、相机和相册功能。
