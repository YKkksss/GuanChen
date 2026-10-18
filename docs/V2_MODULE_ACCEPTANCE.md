# v2.0.0 模块验收矩阵（P0 初版）

用途：把“模块完成”从口头判断变成可勾选清单。状态只反映 2026-10-18 的代码与测试事实，不把历史验收当成当前版本已重跑。

## 1. 状态图例

| 标记 | 含义 |
| --- | --- |
| ✅ | 当前版本有明确证据 |
| ◐ | 有部分证据，或证据来自旧版本/模拟环境 |
| ○ | 未验证 |
| — | 不适用 |

“功能完成”只表示入口、主流程、保存与边界存在；不等于浏览器、真机、真实模型或生产部署已验收。

## 2. 验收矩阵

| # | 模块 | 主入口 | 自动专项 | 桌面浏览器 | 窄屏/真机 | 文档 | 当前结论 | 待补 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 命盘 | `/chart`、`/chart/[id]` | ✅ conversations/transits/context/followup | ◐ 历史有，本轮未重跑 | ○ | ✅ | 功能完成，体验待重验 | E2E、真机 |
| 2 | 运势日历 | `/chart/[id]/calendar` | ✅ fortune-calendar | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 3 | 紫微运势专题 | `/chart/[id]/fortune` | ✅ fortune-topics | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 4 | 紫微合盘 | `/heming`、`/heming/[id]` | ✅ heming-*（7 组） | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、真机 |
| 5 | 八字 | `/bazi`、`/bazi/reading/[id]`、`/bazi/chat/[id]` | ✅ bazi-*（27 组，含司令/入口） | ◐ 历史有；入口面板未跑 | ○ | ✅ | 功能完成，入口面板待验收 | 入口面板四宽度、E2E |
| 6 | 紫微八字合参 | `/synthesis`、`/synthesis/[id]` | ✅ synthesis/dynamic/review | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 7 | 择日 | `/election`、`/election/[id]` | ✅ election/elect-hours/personal/luck | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 8 | 梅花 | `/meihua`、`/meihua/[id]` | ✅ meihua/reading/imagery/scenarios | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 9 | 六爻 | `/liuyao`、`/liuyao/[id]` | ✅ liuyao/reading/influence | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 10 | 奇门 | `/qimen`、`/qimen/[id]` | ✅ qimen/reading/scenarios | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 11 | 生时校正 | `/rectification`、`/rectification/[id]` | ✅ rectification-*（6 组） | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、真机 |
| 12 | 历史档案 | `/history` | ◐ v1-intake-history | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、分页/删除 |
| 13 | 命盘报告 | `/chart/[id]/reports`、`/reports/[reportId]` | ✅ reports/evidence/facts/pdf/comparisons/revisions | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、PDF 字体部署 |
| 14 | 人生时间轴 | `/chart/[id]/events` | ✅ events/event-*（4 组） | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 15 | 运限分析 | `/chart/[id]/timeline` | ✅ transits/monthly/daily/annual | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、真机 |
| 16 | 月度复盘 | `/reviews` | ✅ monthly-reviews | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E |
| 17 | 本地提醒 | `/reminders` | ✅ reminder-foundation/center | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、站内通知说明 |
| 18 | 学习中心 | `/learn`、`/learn/[course]` | ✅ learning-*（4 组） | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 19 | 紫微知识库 | `/knowledge` | ○ 无独立专项（内容型） | ◐ 历史有 | ○ | ✅ | 内容存在，未自动验收 | 人工走查、SEO/索引 |
| 20 | 古籍原典 | `/library` | ○ 无独立专项（内容型） | ◐ 历史有 | ○ | ✅ | 内容存在，未自动验收 | 人工走查、搜索 |
| 21 | 练习中心 | `/practice`、`/practice/*` | ✅ learning-practice/open-practice | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、窄屏 |
| 22 | 匿名案例 | `/cases`、`/cases/*` | ✅ case-*（3 组） | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、同意/匿名边界 |
| 23 | 账号设置 | `/settings/account` | ✅ accounts/request-boundary | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、改密/撤销会话 |
| 24 | 数据保险箱 | `/settings/data` | ✅ backups/lifecycle/encrypted/chart-transfer | ◐ 历史有 | ○ | ✅ | 功能完成 | 恢复演练、E2E |
| 25 | 管理员用户管理 | `/settings/users` | ✅ accounts | ◐ 历史有 | ○ | ✅ | 功能完成 | 权限人工复核 |
| 26 | 登录 / 注册 | `/login`、`/register` | ✅ accounts | ◐ 历史有 | ○ | ✅ | 功能完成 | E2E、错误态 |
| 27 | 隐私 / 条款 | `/privacy`、`/terms` | ○ 无自动专项 | ◐ 历史有 | ○ | ✅ | 内容存在 | 与实际数据流核对 |

## 3. 全局验收缺口（P0/P1）

| 缺口 | 归属 | 说明 |
| --- | --- | --- |
| 入口面板真实浏览器 + 320/390/768/1280 | P4 | 本轮新增，尚未在浏览器实际展开 |
| 统一 E2E 种子与会话启动器 | P4 | 现有 QA 脚本按模块分散 |
| 桌面关键链路 E2E | P4 | 注册→起盘→聊天→报告→PDF→备份→恢复→隔离 |
| 窄屏 E2E | P4 | 320/390/768 |
| iOS/Android 真机 | P4 | 目前均为视口模拟或历史记录 |
| axe 关键页 | P4 | 未跑 |
| 空/错/加载/重试巡检 | P4 | 各模块状态不统一 |
| 旧报告/旧聊天兼容抽查 | P4 | v1～v6 报告、旧聊天 |
| 迁移/恢复/回滚演练 | P2 | 数据保险箱自动测试不等于真实演练 |
| 真实模型四类冒烟 | P5 | 当前全部为模拟供应商 |
| PDF 字体在目标系统可用 | P2 | Windows 可用不代表 Linux 可用 |
| 管理员/隐私条款人工复核 | P3 | 需要真实权限与文本核对 |

## 4. 逐模块“完成”判定

一个模块只有在以下 7 项全部为 ✅ 时，才能在发布说明里写“已交付”：

1. 入口与主流程可用。
2. 空状态、错误状态、加载状态、重试存在。
3. 账号隔离与权限边界通过。
4. 实施文档与已知限制存在。
5. 至少一个专项自动测试通过。
6. 桌面与窄屏验收通过；关键模块真机通过。
7. 旧报告/旧聊天不补算、不串版本。

当前没有任何模块达到 7/7；多数为 1、3、4、5 完成，2、6、7 待补。这是 v2.0 冻结前的主要工作量。

## 5. 签署

| 角色 | 姓名 | 日期 | 结论 |
| --- | --- | --- | --- |
| 开发 | 待填 | | 功能与自动测试 |
| 验收 | 待填 | | 浏览器/真机/恢复 |
| 发布 | 待填 | | 范围与门槛 |

在 P0 阶段只完成矩阵初版，不代替 P4/P5 的实际验收。
