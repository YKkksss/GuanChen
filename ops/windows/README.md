# Windows 部署说明

推荐使用 NSSM（或等价的服务托管工具）把 `next start` 作为 Windows 服务运行；不要依赖一个保持打开的 cmd 窗口。

## 安装服务

```powershell
$node = (Get-Command node).Source
nssm install GuanChen $node "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 30001"
nssm set GuanChen AppDirectory "C:\GuanChen"
nssm set GuanChen AppEnvironmentExtra `
  "NODE_ENV=production" `
  "ACCOUNT_DATA_DIR=G:\GuanChenData\accounts" `
  "APP_PUBLIC_ORIGIN=https://guanchen.example.com" `
  "AUTH_COOKIE_SECURE=1"
nssm set GuanChen AppStdout "G:\GuanChenData\logs\app.log"
nssm set GuanChen AppStderr "G:\GuanChenData\logs\app.err.log"
nssm set GuanChen AppRotateFiles 1
nssm set GuanChen AppRotateOnline 1
nssm start GuanChen
```

NSSM 的日志轮转参数各版本略有差异；若不可用，请用任务计划按天切割或使用集中日志。

## 定时备份

新建任务计划，每天固定时间运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\GuanChen\ops\windows\backup.ps1" -AppDirectory "C:\GuanChen" -Source "G:\GuanChenData\accounts" -Target "G:\GuanChenBackups" -Keep 14
```

`backup.ps1` 会调用 `npm run ops:backup`，把退出码写入日志。任务计划应配置“失败时通知”。

## 健康检查

```powershell
Invoke-WebRequest http://127.0.0.1:30001/api/health -UseBasicParsing
```

## 注意

- 关闭 Windows 快速启动/休眠对持久服务的影响，确保重启后服务自动拉起。
- `G:\GuanChenData` 与备份盘不要放在用户下载目录或同步盘中。
- 字体、原生模块和路径与 Linux 不同，部署前按 [P2 部署手册](../../docs/P2_DEPLOYMENT.md) 跑预检。
