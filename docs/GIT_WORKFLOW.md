# Git 提交与阶段推送约定

本文件约束 v2.0 冻结前的提交、分支、标签与推送方式。目标：每个阶段可回溯、可复现、可推送，不用“大杂烩提交”。

## 1. 提交信息格式

采用 Conventional Commits 1.0.0：

```text
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`：必填，见下表。
- `scope`：可选，但本项目建议写，限定影响范围。
- `subject`：中文，祈使句，说明“做了什么”，不超过 50 字，结尾不加句号。
- `body`：说明“为什么”和“验证了什么”，每行不超过 72 字；可省略。
- `footer`：不兼容变更写 `BREAKING CHANGE:`；关联 issue 写 `Refs: #123`。

### type

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 文档、交接、验收记录 |
| `test` | 测试脚本、夹具、断言 |
| `refactor` | 不改变行为的重构 |
| `perf` | 性能优化 |
| `build` | 构建、依赖、原生模块 |
| `ci` | CI/CD 配置 |
| `chore` | 仓库维护、忽略规则、脚本杂项 |
| `revert` | 回滚提交 |

### scope 示例

`auth`、`bazi`、`chart`、`synthesis`、`election`、`meihua`、`liuyao`、`qimen`、`reports`、`backups`、`ui`、`api`、`db`、`release`、`p0`、`p1`、`docs`、`ci`。

### 示例

```text
feat(bazi): 增加月令取用入口复核

- 并列本气、他藏、单透、多透与完整三合三会
- 缺字、六合、六冲、天干五合、五行相克单列待核
- 接入 v6 报告、v23 问答与事实指纹

验证：入口专项 2,687 项、全量 104/104、tsc、next build。
```

```text
fix(build): 允许 better-sqlite3 安装脚本

npm 12 默认阻止依赖安装脚本，干净 clone 构建通过但运行缺少原生 binding。
加入 allowScripts 固定版本，并在全新 clone 复验 require('better-sqlite3')。

Refs: P0
```

## 2. 提交粒度

- 一个逻辑变更一个提交；不把“账号 + 术数 + 文档 + 构建产物”混在一起。
- 不提交 `.next-*`、`node_modules`、`data/`、`output/`、`.env.local`、日志、SQLite、备份、PDF。
- 提交前跑与改动相称的测试；发布相关提交跑 typecheck + build。
- 不为了“看起来干净”删除负向测试或改写历史验收记录。

## 3. 分支与标签

| 用途 | 命名 |
| --- | --- |
| 日常开发 | `codex/user-accounts` |
| 发布收口 | `release/2.0` |
| 阶段快照 | `v2.0.0-alpha.N`、`v2.0.0-beta.N` |
| 候选版 | `v2.0.0-rc.N` |
| 正式版 | `v2.0.0` |

- 标签使用 annotated tag，附阶段说明。
- `v1.0.0` 不移动；历史分支不删除；不强推。

## 4. 阶段推送规则

每个阶段（P0、P1、……）出口条件通过后，**执行一次推送**：

```powershell
git status --porcelain
git push -u origin release/2.0
git push origin v2.0.0-alpha.1
```

要求：

1. 推送前工作区干净；未提交的改动先归类提交。
2. 推送前确认没有密钥、真实数据、构建产物。
3. 阶段标签与分支一起推送；不单独推一个“半成品”标签。
4. 推送后记录 commit、tag、CI 结果到对应验收 JSON。
5. 推送失败不重试强推；先检查网络、权限、分支保护。

## 5. 阶段完成记录模板

```text
阶段：P1
分支：release/2.0
提交：<hash> <subject>
标签：v2.0.0-beta.1
推送：origin/release/2.0、origin/v2.0.0-beta.1
验收：<命令与结果>
未完成：<明确列出>
下一阶段：P2
```
