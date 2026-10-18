# 观辰本地启动与局域网使用

这份指南面向“只在自己电脑或局域网使用”的用户。不需要域名、证书或公网服务器。

## 1. 准备

- Node.js 24（最低 22）。
- npm。
- 首次需要联网下载依赖。

```bash
git clone --branch release/2.0 https://github.com/YKkksss/GuanChen.git
cd GuanChen
npm ci
```

如果 npm 提示 `better-sqlite3` 缺少原生模块，确认 `package.json` 已包含 `allowScripts`；必要时执行 `npm rebuild better-sqlite3`。

## 2. 一键启动

```bash
npm run local
```

首次运行会：

1. 检查 Node 与依赖。
2. 若没有 `.env.local`，从 `.env.example` 复制一份（不会覆盖已有配置）。
3. 若没有生产构建，自动执行一次 `npm run build`。
4. 在 `0.0.0.0:30001` 启动，并打印本机与局域网地址。

开发模式：

```bash
npm run local:dev
```

只检查环境、不启动：

```bash
npm run local -- --check
```

## 3. 访问

启动后终端会打印类似：

```text
本机： http://127.0.0.1:30001
局域网：http://192.168.1.23:30001
```

- 同一台电脑用“本机”地址。
- 手机/平板与电脑连同一个 Wi-Fi，用“局域网”地址。
- Windows 首次启动可能弹出防火墙提示，请允许“专用网络”访问 Node。
- 如果手机打不开，依次检查：同一网段、电脑防火墙、路由器是否隔离客户端、地址是否用了 `localhost`（手机上的 localhost 是手机自己）。

## 4. 首次使用

1. 打开 `/register` 注册第一个账号。
2. 注册后按需指定管理员（可选）：

```bash
npm run accounts:manage -- admin 你的用户名
```

3. 在首页录入出生资料，进入命盘工作台。
4. AI 问答/报告需要先在 `.env.local` 配置 `DEEPSEEK_API_KEY` 或 MIMO 配置，然后重启服务。打开“账号设置”可看到 AI 是否已配置、当前模型和今日用量；`AI_DAILY_LIMIT` 控制每账号每日次数（0 表示不限）。

## 5. 数据与备份

- 默认数据目录：`data/accounts/`（含账号库、各用户业务库、导出与备份）。
- 该目录已被 `.gitignore` 忽略，不要提交或公开。
- 网页“数据保险箱”可以导出当前账号的完整备份。
- 服务器侧在线备份：

```bash
npm run ops:backup -- --source=data/accounts --target=data/operational-backups --keep=7
```

- 停止服务后复制整个 `data/accounts` 也是有效备份；恢复时先停服务，再替换目录。

## 6. 可选：公网部署

如果以后要让外网访问，再阅读 [P2 部署与运维手册](P2_DEPLOYMENT.md)，配置：

- 域名与 HTTPS 证书
- 反向代理（流式不缓冲、上传限制）
- `APP_PUBLIC_ORIGIN`、`AUTH_COOKIE_SECURE=1`
- 服务器侧定时备份与离机副本

本地使用不需要这些配置；公网部署由用户自行决定和承担运维。

## 7. 常见问题

| 现象 | 先检查 |
| --- | --- |
| 端口 30001 被占用 | 关闭旧服务，或设置 `PORT=30002 npm run local` |
| 手机打不开 | 是否用电脑局域网 IP、同一 Wi-Fi、防火墙是否放行 |
| 登录后写入 403 | 是否通过 `localhost`/局域网 IP 访问；不要混用域名和 IP |
| AI 返回 503 | `.env.local` 是否配置了对应供应商密钥 |
| PDF 缺字 | 配置 `REPORT_PDF_FONT_PATH`/`REPORT_PDF_BOLD_FONT_PATH` |
| SQLite 原生模块缺失 | `npm rebuild better-sqlite3`，确认 `allowScripts` |
