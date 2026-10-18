# P1 发布工程实施记录

开发日期：2026-10-18。分支 `release/2.0`。阶段目标：让每次变更可构建、可观测、可自检，为 P2 数据与部署提供基础。

## 1. 本轮实现

### 1.1 CI

新增 `.github/workflows/ci.yml`：

- 触发：`release/2.0` push、指向 `release/2.0` 或 `main` 的 pull request、手动触发。
- 运行环境：`windows-latest`，Node 24，npm cache。
- 步骤：`npm ci` → `npm run build` → `npx tsc --noEmit` → `npm run release:check` → `npm run test:v1-all`。
- 权限：`contents: read`；并发组按 ref 取消旧运行。

选择 Windows runner 是为了与当前已验证环境一致，避免 Linux 中文字体、原生模块和路径差异让 CI 变成噪声。Linux 部署验证放在 P2。

### 1.2 健康检查

新增 `app/api/health/route.ts`，公开 GET，`Cache-Control: no-store`，返回 `200` 或 `503`。

检查项：

| 检查 | 行为 |
| --- | --- |
| `process` | 进程存活与 uptime |
| `dataDir` | 账号根目录可写；不存在但父目录可写时为 `not_initialized` |
| `database` | 只读打开 `accounts.sqlite` 并执行 `SELECT 1`；不创建目录、不迁移、不写库 |
| `disk` | `statfs` 可用空间；低于 100 MiB 为 `low` |

- 未初始化（首次部署、尚无账号）不返回失败；数据库损坏、目录不可写、磁盘不足返回 `degraded` + `503`。
- 响应带 `x-request-id`；不返回绝对路径、账号、密钥或业务数据。

### 1.3 结构化请求日志

新增 `lib/observability/logger.ts`：

- 输出 JSON 行：`ts`、`level`、`event`、`requestId`、`method`、`path`、`status`、`durationMs`、`userId`、`role`、`errorName`。
- 敏感键（password、token、cookie、authorization、api key、session）统一 `[redacted]`；超长字符串截断；不接收请求体、聊天正文或密码。
- `withAccount` 统一记录 `request.completed` / `request.failed`；401 也会记录；流式响应在响应创建时记录，流结束仍保留原账号 scope。
- `x-request-id` 优先使用客户端传入的合法值（`[A-Za-z0-9._-]{1,64}`），否则生成 UUID；所有账号接口响应都带该头。

### 1.4 发布自检

新增 `scripts/release-check.mjs`，命令 `npm run release:check`，检查：

- 跟踪文件中是否有 `.next-*`、`node_modules`、`data/`、`output/`、`.env.local`、SQLite、日志、`tsbuildinfo`。
- 必需文档是否齐全。
- `package.json` 版本格式、必需脚本、`allowScripts` 是否固定原生依赖。
- 业务库迁移版本是否为 56。
- `.gitignore` 是否覆盖构建、数据、日志、浏览器缓存。
- 跟踪文本中是否存在 `sk-*`、`gho_*`、`github_pat_*`、AKIA、私钥块。
- 可选 `--require-clean` 检查工作区。

输出 JSON，任一失败退出码为 1。当前本地运行通过：1,179 个跟踪文件、1,081 个文本文件、0 个密钥命中。

### 1.5 生产只读验收

新增 `scripts/qa-production-readonly.mjs`，命令 `npm run qa:production-readonly`。

- 只发 GET，不创建、不修改、不生成、不调用 AI。
- 通过 `GUANCHEN_BASE_URL` 指定地址，`GUANCHEN_COOKIE` 或 `GUANCHEN_SESSION` 指定会话。
- 检查 `/api/auth/session`、命盘会话、八字档案、择日、提醒、备份、课程、案例等读取端点。
- 每条记录状态码、耗时、`Cache-Control` 与响应形状；任一非 200 或缺少 `no-store` 即失败。
- 可选 `GUANCHEN_READONLY_OUT` 写 JSON 证据。

### 1.6 专项测试

新增 `scripts/test-release-engineering.ts`，命令 `npm run test:release-engineering`，覆盖：

- 健康检查未初始化、账号库正常、账号库损坏三种状态。
- 只读数据库探测不产生初始化写入。
- 日志敏感字段脱敏与超长截断。
- 未登录 401 与登录 200 都带合法且独立的 request id。
- 健康检查禁止缓存。

### 1.7 PDF 测试字体固定

首次 CI 在 GitHub Windows runner 上 `test:report-pdf` 失败：系统缺少固定中文字体或字体度量不同，导致同一分页夹具的页数漂移。

处理：

- 将 Noto Sans SC 子集字体提交到 `scripts/fixtures/fonts/`（Regular/Bold 约 280 KB，SIL OFL 1.1，许可全文随包）。
- `test-report-pdf-exports.ts` 在渲染前显式设置 `REPORT_PDF_FONT_PATH` 与 `REPORT_PDF_BOLD_FONT_PATH`，不再依赖开发机或 CI 系统字体。
- 固定字体下页数基线为 3 页；测试仍防止免责声明孤页或额外增页。

## 2. 验收

- `tsc --noEmit`：通过。
- `next build`：通过。
- `npm run release:check`：通过（1,186 个跟踪文件、1,088 个文本文件、0 个密钥命中）。
- `test:release-engineering`：20 项通过。
- 全量 `test:v1-all`：**105/105 组通过**。
- 账号安全专项：289 项通过；`/api/health` 加入公开白名单并断言 200。
- GitHub Actions：最终 run **39112743990** 成功（windows-latest，9m16s），步骤为 install / build / typecheck / release-check / full-regression。
- CI 历史：首轮因 PDF 字体失败（已修）；第二轮 `test:synthesis-dynamic-review` 单次失败，本地连续 5 次未复现，第三轮通过；该单次失败保留为观察项。

## 3. 本轮明确不做

- 不做 Linux 部署验证（P2）。
- 不做日志落盘、轮转、外部告警（P2 运维）。
- 不做生产只读脚本对真实账号的执行（P2 staging）。
- 不新增监控平台、APM 或第三方 SaaS。
- 不改数据库结构，不新增迁移。

## 4. 下一阶段

P2 数据与部署：

1. 目标主机、域名、HTTPS、持久磁盘、备份盘。
2. 干净机器部署文档与脚本。
3. 反代流式、上传限制、超时。
4. 进程守护、日志轮转、磁盘监控。
5. 服务器侧定时备份与失败告警。
6. v47→v56 迁移、备份恢复、加密导出、旧库迁移、单盘迁移、回滚演练。
7. staging 部署与冒烟。
