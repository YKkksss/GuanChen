# v2.0.0 P0 工作区盘点与收口记录

盘点时间：2026-10-18。分支 `codex/user-accounts`，HEAD `8e5afe5`，业务库 v56。

## 1. 盘点结果

| 指标 | 数量 |
| --- | ---: |
| 工作区变更条目（收口前） | 610 |
| 忽略构建产物后 | 600 |
| 已跟踪修改 | 223 |
| 未跟踪路径 | 377 |
| 源码/配置 | 281 |
| 测试脚本 | 116 |
| 文档/证据 | 203 |
| 构建产物/私密数据（应忽略） | 0（已由 `.gitignore` 排除） |

分类口径：`app/`、`components/`、`lib/`、`public/`、`hooks/`、`middleware.ts`、`next.config.js`、`tsconfig.json`、`package*.json`、`.env.example`、`.gitignore` 计为源码/配置；`scripts/` 计为测试脚本；`docs/`、`README.md`、根目录交接文档计为文档/证据。

### 1.1 源码/配置分布

| 目录 | 已跟踪修改 | 未跟踪 | 小计 |
| --- | ---: | ---: | ---: |
| `app/` | 117 | 23 | 140 |
| `components/` | 16 | 60 | 76 |
| `lib/` | 15 | 42 | 57 |
| `public/` | 0 | 1 | 1 |
| 根配置（middleware、next、tsconfig、package、env 示例、gitignore） | 7 | 0 | 7 |
| **合计** | | | **281** |

### 1.2 测试与文档

| 目录 | 已跟踪修改 | 未跟踪 | 小计 |
| --- | ---: | ---: | ---: |
| `scripts/` | 66 | 50 | 116 |
| `docs/` | 1 | 200 | 201 |
| `README.md` | 1 | 0 | 1 |
| `项目交接文档.md` | 0 | 1 | 1 |

## 2. 排除项（不进 Git）

| 路径/类型 | 原因 | 处理 |
| --- | --- | --- |
| `.next/`、`.next-*/` | 构建缓存，约 1.39 GB，49 个目录 | 全部忽略；不删除，保留历史验收产物 |
| `node_modules/` | 依赖，约 457 MB | 忽略 |
| `data/` | 真实/本地数据、账号库、备份、导出 | 整体忽略；不读取、不移动 |
| `output/` | 历史临时产物、PDF | 整体忽略 |
| `.env.local`、`.env*` | 密钥与本地配置 | 忽略，仅保留 `.env.example` |
| `*.log`、`next-start.*`、`.codex-dev*` | 运行日志 | 忽略 |
| `*.tsbuildinfo` | 增量编译缓存 | 忽略 |
| `.playwright-mcp/` | 浏览器工具缓存 | 忽略 |
| `.vercel/`、`dist/` | 部署/构建产物 | 忽略 |

`.gitignore` 已收口为通用规则：`.next-*/`、`data/`、`output/`、`*.log`、`.playwright-mcp/`，避免后续再按目录逐个补。

## 3. 私密数据边界

- 本次盘点只读取路径、文件大小和 Git 状态，没有打开 `data/` 下的 SQLite、账号库、备份或导出文件。
- 没有读取 `.env.local` 内容；构建只加载环境，不打印配置。
- `data/` 与 `output/` 整体忽略；即使误执行 `git add -A` 也不会进入版本库。
- 未执行 `git clean`、`git reset --hard`、历史分支删除或标签移动。

## 4. 分批提交计划

| 批次 | 内容 | 目的 |
| --- | --- | --- |
| 1 | `.gitignore`、`docs/V2_SCOPE.md`、`docs/V2_PHASE_PLAN.md`、`docs/V2_RELEASE_PLAN.md`、`docs/V2_DEVELOPMENT_BACKLOG.md`、本文件、模块验收矩阵 | 先固定范围与忽略规则 |
| 2 | `lib/**`、`app/api/**`、`middleware.ts`、`next.config.js`、`package*.json`、`tsconfig.json`、`.env.example` | 服务端与配置 |
| 3 | `components/**`、`app/**` 其余页面、`public/**` | 前端与静态资源 |
| 4 | `scripts/**`、`docs/**` 其余文档与证据、`README.md`、`项目交接文档.md` | 测试、文档、交接 |

每个批次提交前复核 `git status` 与 `git diff --cached --stat`，不把构建产物、私密数据或无关文件带入。

## 5. 收口验证

- [x] `.gitignore` 覆盖全部 `.next-*`、`data/`、`output/`、日志、浏览器缓存。
- [x] 600 条变更完成五类归类。
- [x] 源码/文档中未发现 `sk-*`、`gho_*`、`github_pat_*`、AKIA、私钥块。
- [x] `data/` 无已跟踪文件。
- [x] 四批提交完成，工作区干净（`git status --porcelain` 为空）。
- [x] `release/2.0` 分支创建。
- [x] 干净 clone 生产构建通过（`npm ci` + `next build`，81 个静态页）。
- [x] GitHub milestone `v2.0.0` 创建（编号 1），P0/P1/P2 标签已建。
- [ ] `v2.0.0-alpha.1` 标签创建（在原生模块复现验证后打）。

### 5.1 原生模块复现问题（已定位，待提交修复）

首次干净 clone 用 `npm ci` 安装后，构建通过，但运行 `require('better-sqlite3')` 失败：npm 12 默认阻止依赖安装脚本，`better-sqlite3` 没有生成 `better_sqlite3.node`。

复现与修复：

```powershell
npm ci
npm install-scripts approve better-sqlite3 esbuild
npm rebuild better-sqlite3
node -e "require('better-sqlite3'); console.log('ok')"
```

`approve` 会在 `package.json` 写入 `allowScripts`；本仓库已加入固定的 `better-sqlite3@12.4.1`、`esbuild@0.28.2`、`esbuild@0.25.12` 条目。仅 `approve` 不重新执行安装脚本，必须再 `npm rebuild` 或重新 `npm ci`。

该项属于 P1/G1“原生模块可安装”的验收内容，但会影响 P2 干净部署，因此提前记录。修复提交后需在全新 clone 上复验 `npm ci → require('better-sqlite3')`，不能只在已有 `node_modules` 的工作区验证。

## 6. 残留风险

1. `docs/` 现有 299 个已跟踪文件，包含实施文档、验收 JSON 与截图；已扫描密钥模式，未发现真实凭据，但仍含本机绝对路径（如 `C:/Users/11474/...`），发布前可选择性清理，不影响源码安全。
2. `docs/images` 与 `docs/qa-evidence` 体积较大，但单个文件均小于 1 MB，GitHub 可接受。
3. `.next-*` 目录保留在磁盘，容易被误以为源码；`.gitignore` 已阻断入库，但清理前需确认不是唯一验收证据。
4. npm 12 默认阻止原生安装脚本；已通过 `allowScripts` 固定 `better-sqlite3` 与 `esbuild`，但每次依赖升级都要重新确认版本条目，否则干净部署会缺 `better_sqlite3.node`。
5. 未推送远程；`release/2.0` 与标签目前只在本地，需用户确认后再 push。
