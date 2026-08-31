# M2 人生事件时间轴第一版实现说明

## 1. 当前交付范围

本阶段完成用户手动确认的人生事件档案和年度运势关联，包含：

- 事件新增、编辑和删除。
- 学业、事业、财务、感情、亲子、搬迁、家庭、健康、成果和自定义分类。
- 仅年份、年月、完整日期、日期范围和日期不详。
- 1 至 5 级影响程度。
- 按自然年份展示的纵向时间轴和分类筛选。
- 事件自动关联对应年份的年度运势快照。
- 跨年事件按“开始、持续、结束”建立多个年度关联。
- 从事件跳转到对应年份的年度分析。
- 本地 JSON 导出。

M2-1 已补充聊天事件候选提取、独立确认层、已确认事件上下文和长期记忆保护。AI 只能创建候选，不能直接写入正式事件。实现细节见 `docs/M2_1_LIFE_EVENT_CANDIDATE_CONFIRMATION_IMPLEMENTATION.md`。

M2-2 已把原有“所有日期都只关联年度”升级为按日期精度关联流年、流月和流日，并补充现实事实与命理时间结构的因果边界。实现细节见 `docs/M2_2_EVENT_TRANSIT_PRECISION_IMPLEMENTATION.md`。

M2-3 已增加事件专项 AI 回溯：用户可以针对单条已确认事件生成、缓存、重新打开和重新生成分析；事件事实变化后旧版本保留并标记为需要更新。实现细节见 `docs/M2_3_EVENT_RETROSPECTIVE_ANALYSIS_IMPLEMENTATION.md`。

## 2. 数据库

数据库第 5 版迁移新增：

### `life_events`

保存事件原始事实、日期精度、分类、影响程度、来源及用户确认状态。

### `event_transit_links`

保存事件和年度运势快照之间的关联。关联类型包括：

- `occurs_in`：事件发生在该年。
- `starts_in`：跨年事件从该年开始。
- `continues_in`：跨年事件在该年持续。
- `ends_in`：跨年事件在该年结束。

事件日期被修改后，系统会重建其运限关联。删除事件不会删除运限快照；删除会话会级联删除事件和关联。数据库第 45 版迁移已将关联层级扩展为 `year`、`month`、`day`，并完整保留旧的年度关联。

## 3. API

    GET    /api/conversations/[id]/events
    POST   /api/conversations/[id]/events
    GET    /api/conversations/[id]/events/[eventId]
    PATCH  /api/conversations/[id]/events/[eventId]
    DELETE /api/conversations/[id]/events/[eventId]

分类和年份筛选：

    GET /api/conversations/[id]/events?category=career&year=2021

JSON 导出：

    GET /api/conversations/[id]/events?format=json

## 4. 页面

人生事件时间轴：

    /chart/[id]/events

命盘页和运限分析页均提供入口。事件卡展示分类、日期、影响程度，以及按层级分组的流年、流月、流日摘要；点击某个关联可进入对应时间层级。

## 5. 事实边界

- 手动录入事件默认视为用户已确认事实。
- 事件使用独立表保存，不依赖聊天摘要。
- AI 后续只能创建未确认候选，必须经过用户确认界面后才能成为正式事件。
- 日期不详的事件不强行关联年份，避免产生虚假运限关系。

## 6. 验证

    npm run test:events
    npm run test:transits
    npm run test:conversations
    npm run test:context
    npm run build

测试覆盖日期校验、CRUD、年月日关联、区间起止边界、修改后重建关联、筛选、数据库迁移和级联删除。

## 7. 后续工作

M2-1 已完成：

1. 从聊天中提取候选事件并由用户确认；
2. 将已确认事件按当前问题和年份注入 AI 上下文；
3. 确认前候选、正式事件、记忆和上下文严格隔离。

后续增强：

1. 年龄轴和年份轴切换；
2. 更完整的档案导入和备份恢复。
