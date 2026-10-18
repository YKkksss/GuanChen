# 观辰 v2.0 部署与运维手册（P2）

适用范围：单 Node 进程 + 持久磁盘 + 本地 SQLite/文件 + HTTPS 反向代理。当前不承诺多实例、队列或 PostgreSQL。

## 1. 目标拓扑

```text
浏览器
  │ HTTPS
  ▼
Nginx / Caddy（TLS、流式不缓冲、上传限制）
  │ http://127.0.0.1:30001
  ▼
Node 24 + next start（单进程）
  │
  ├── ACCOUNT_DATA_DIR/accounts.sqlite
  ├── ACCOUNT_DATA_DIR/users/<uuid>/ziweidoushu.sqlite
  ├── ACCOUNT_DATA_DIR/users/<uuid>/report-exports/
  └── ACCOUNT_DATA_DIR/users/<uuid>/backups/
```

备份目录必须在数据目录之外，并复制到另一台机器或对象存储；不能只留在同一块磁盘。

## 2. 前置条件

- Node.js 24（最低 22，建议 24）。
- 可持久写入的数据盘。
- 可嵌入的中文字体（TTF/OTF/TTC），或设置 `REPORT_PDF_FONT_PATH`。
- 原生模块可安装：`better-sqlite3`、`pdfkit`。
- 反向代理支持长连接与关闭响应缓冲（AI 流式输出）。
- 不上传 `.env.local`、`data/`、账号库或备份到公开仓库。

## 3. 环境变量

```dotenv
NODE_ENV=production
ACCOUNT_DATA_DIR=/var/lib/guanchen/accounts
AUTH_REGISTRATION_ENABLED=1
AUTH_COOKIE_SECURE=1
APP_PUBLIC_ORIGIN=https://guanchen.example.com
NEXT_PUBLIC_SITE_URL=https://guanchen.example.com

AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
AI_DAILY_LIMIT=200

REPORT_PDF_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
REPORT_PDF_BOLD_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc
```

- `ACCOUNT_DATA_DIR` 必须是持久化绝对路径，且只允许服务账号读写。
- `APP_PUBLIC_ORIGIN` 与浏览器的实际 HTTPS 来源一致；本地 HTTP 测试不要指向正式域名。
- `SQLITE_PATH`、`REPORT_EXPORT_DIR` 只用于无账号脚本/兼容；不要把它们指向正式账号数据目录。
- 真实密钥只放在服务器环境或密钥管理，不写入仓库、截图或文档。

## 4. 首次部署

```bash
# 1. 取得 release 分支源码
git clone --branch release/2.0 https://github.com/YKkksss/GuanChen.git
cd GuanChen

# 2. 安装依赖（npm 12 需要 allowScripts；仓库已固定 better-sqlite3/esbuild）
npm ci

# 3. 构建
npm run build

# 4. 配置环境（示例，不要提交）
cp .env.example .env.local
# 编辑 .env.local，填入正式值

# 5. 预检
npm run ops:preflight

# 6. 启动（建议由 systemd/NSSM 托管）
npm run start:local   # 仅 127.0.0.1:30001，适合反代
```

首次启动后：

```bash
# 注册第一个账号后，指定管理员（不要创建默认管理员密码）
npm run accounts:manage -- admin 你的用户名
```

旧 v1 共享库迁移：先注册一个空白账号并确认没有业务资料，停止服务后执行：

```bash
npm run accounts:manage -- import-legacy 目标用户名
```

## 5. 反向代理

示例见 [ops/nginx/guanchen.conf](../ops/nginx/guanchen.conf)，关键点：

- `proxy_buffering off`：AI SSE 流式输出不被代理攒包。
- `proxy_read_timeout` / `proxy_send_timeout` 建议 300s。
- `client_max_body_size` 至少 130m（加密备份上传上限）。
- `Host`、`X-Forwarded-Proto` 正确传递；应用仍以 `APP_PUBLIC_ORIGIN` 做同源写入校验。
- 证书续期后重载代理，不需要重启应用。

## 6. 进程守护

### Linux systemd

示例见 [ops/systemd/guanchen.service](../ops/systemd/guanchen.service)。

```bash
sudo cp ops/systemd/guanchen.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guanchen
sudo systemctl status guanchen
```

### Windows

使用 NSSM 或等价工具，不要用“开机启动一个 cmd 窗口”的方式。示例命令：

```powershell
nssm install GuanChen "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 30001"
nssm set GuanChen AppDirectory "C:\GuanChen"
nssm set GuanChen AppEnvironmentExtra "NODE_ENV=production" "ACCOUNT_DATA_DIR=G:\GuanChenData\accounts" "APP_PUBLIC_ORIGIN=https://guanchen.example.com" "AUTH_COOKIE_SECURE=1"
nssm set GuanChen AppStdout "G:\GuanChenData\logs\app.log"
nssm set GuanChen AppStderr "G:\GuanChenData\logs\app.err.log"
nssm start GuanChen
```

日志需要轮转（NSSM 本身不轮转），可用 Windows 任务计划或日志服务按天切割。

## 7. 健康检查与监控

```bash
curl -fsS https://guanchen.example.com/api/health
```

- `200`：进程、账号目录、账号库、磁盘正常或尚未初始化。
- `503`：账号库损坏、目录不可写、磁盘低于 100 MiB。
- 响应包含 `x-request-id`；应用日志为 JSON 行，含 requestId、路径、状态、耗时、账号 ID，不含密码、Cookie、聊天正文。
- 监控至少覆盖：进程存活、`/api/health`、磁盘使用率、备份任务成功、错误日志速率。

## 8. 备份

### 8.1 应用内备份

“数据保险箱”只处理当前登录账号，适合用户自助导出；不能替代运营级备份。

### 8.2 服务器侧在线备份

```bash
npm run ops:backup -- \
  --source=/var/lib/guanchen/accounts \
  --target=/var/backups/guanchen \
  --keep=14
```

- 使用 SQLite 在线备份 API 复制 `accounts.sqlite` 和每个 `users/*/ziweidoushu.sqlite`，并执行 `PRAGMA integrity_check`。
- 复制 `report-exports/` 和用户 `backups/` 附件。
- 生成 `manifest.json`，记录 SHA-256、文件大小、复制目录与保留策略。
- 拒绝把目标放在数据目录内部，避免递归备份。
- 建议在低写入窗口执行；附件复制不是数据库快照的一部分，严格一致恢复应停服务后复制整个数据目录。

### 8.3 定时任务

Linux cron：

```cron
15 3 * * * cd /opt/guanchen && /usr/bin/npm run ops:backup -- --source=/var/lib/guanchen/accounts --target=/var/backups/guanchen --keep=14 >> /var/log/guanchen-backup.log 2>&1
```

Windows 任务计划：每天固定时间运行 `ops\windows\backup.ps1`，并把输出写入日志。

### 8.4 离机副本

每天把 `/var/backups/guanchen` 同步到另一台机器或对象存储；至少保留 7 天，重要版本保留 30 天。只备份在同一块磁盘不算灾备。

## 9. 恢复

1. 停止服务，确认没有生成任务和文件句柄。
2. 保留当前损坏目录（不要直接删除）。
3. 复制最近一次备份目录到 `ACCOUNT_DATA_DIR`：

```bash
sudo systemctl stop guanchen
sudo mv /var/lib/guanchen/accounts /var/lib/guanchen/accounts.broken-$(date +%s)
sudo cp -a /var/backups/guanchen/accounts-2026-... /var/lib/guanchen/accounts
sudo chown -R guanchen:guanchen /var/lib/guanchen/accounts
sudo systemctl start guanchen
curl -fsS https://guanchen.example.com/api/health
```

4. 用原账号登录，核对命盘、聊天、报告、附件；用 `PRAGMA integrity_check` 或应用健康检查确认。
5. 恢复失败时保留现场，回到备份前的副本，不要反复覆盖唯一备份。

## 10. 迁移

- 应用首次访问某个账号库时自动执行迁移链；当前业务库目标版本 **v56**。
- 升级前先做一次服务器侧备份；在副本上演练 v47→v56，确认数据完整后再升级正式库。
- 旧备份/单盘包有严格版本匹配；旧 v55 或更早包不能直接当 v56 恢复，应先用兼容代码恢复再升级。
- `v1.0.0` 旧共享库使用 `accounts:manage -- import-legacy`，不要自动分配给第一个注册者。

## 11. 回滚

- v2 数据不能直接交给 v1 代码运行；回滚必须同时恢复“升级前备份 + 对应旧代码”。
- 回滚前停止服务，保留 v2 数据副本，再启动旧版本，核对账号/命盘/报告。
- 不允许用 `git reset --hard` 或强推切换发布；使用发布标签与备份。

## 12. 本地 staging 冒烟

在没有正式域名时，可先用隔离数据目录在 30002 端口演练：

```powershell
$env:ACCOUNT_DATA_DIR = Join-Path $env:TEMP 'guanchen-staging-accounts'
$env:APP_PUBLIC_ORIGIN = 'http://127.0.0.1:30002'
$env:AUTH_COOKIE_SECURE = '0'
$env:AUTH_REGISTRATION_ENABLED = '1'
$env:DEEPSEEK_API_KEY = 'staging-local-placeholder'
$env:DEEPSEEK_BASE_URL = 'http://127.0.0.1:39999'
node_modules\.bin\next start -H 127.0.0.1 -p 30002
```

另开终端验证：

```powershell
Invoke-WebRequest http://127.0.0.1:30002/api/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:30002/login -UseBasicParsing
```

然后注册合成账号，运行 `npm run qa:production-readonly`（设置 `GUANCHEN_COOKIE`）。本地 staging 通过不代表 HTTPS/域名/真机验收。

## 13. 本轮验收

- `test:deployment-ops`：15 项通过，覆盖预检、在线备份、SQLite 完整性、保留策略、拒绝嵌套备份目标、模拟数据丢失后恢复。
- 本地 staging：`scripts/qa-staging-smoke.mjs` 在 `127.0.0.1:30002` 用隔离数据目录完成健康检查、登录页、注册、会话、7 个只读接口与注册后数据库健康检查，14/14 通过；证据见 [staging JSON](qa-evidence/2026-10-18-v2.0-p2-staging.json)。
- 迁移演练：用 `v1.0.0` worktree 生成合成 v47 业务库，放入当前用户目录后自动迁移到 v56；标记表保留、`conversations` 表存在、`PRAGMA integrity_check=ok`；证据见 [迁移 JSON](qa-evidence/2026-10-18-v2.0-p2-migration-drill.json)。
- 全量回归与 CI：本地 106/106；GitHub Actions run **39115216388** 成功（windows-latest，10m9s，106 组）。
- **P2 只算本地部分完成**：正式主机、域名、HTTPS、服务器侧定时任务、离机备份与真实数据恢复仍未执行；因此本阶段标签为 `v2.0.0-beta.2`，不是 `rc.1`。

## 14. 已知限制

- 当前单 Node 进程；生成锁、取消、维护互斥不跨实例，不要直接多开。
- 自动备份的浏览器触发逻辑仍存在；运营级备份必须使用服务器定时任务。
- 没有邮件找回密码、2FA、全局 AI 预算平台；已有管理员本地重置密码（`accounts:manage -- reset-password`）与每账号每日 AI 次数上限。
- 真实模型质量只做 P5 冒烟与抽样，不承诺全面合格。
- Windows 与 Linux 的字体、原生模块、路径需要分别验证。
