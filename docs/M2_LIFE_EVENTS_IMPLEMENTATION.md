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

聊天中的事件候选自动提取尚未开放。后续实现时，候选事件必须经过用户确认，不能直接写入长期档案。

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

事件日期被修改后，系统会重建其年度关联。删除事件不会删除年度快照；删除会话会级联删除事件和关联。

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

命盘页和年度分析页均提供入口。事件卡展示分类、日期、影响程度和年度运势摘要；点击关联区可进入目标年份的年度分析。

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

测试覆盖日期校验、CRUD、年度关联、跨年关系、修改后重建关联、筛选和级联删除。

## 7. 后续工作

M2 下一版建议依次增加：

1. 从聊天中提取候选事件并由用户确认。
2. 将已确认事件按当前问题和年份注入 AI 上下文。
3. 事件回溯分析及分析结果缓存。
4. 年龄轴和年份轴切换。
5. 更完整的档案导入和备份恢复。
