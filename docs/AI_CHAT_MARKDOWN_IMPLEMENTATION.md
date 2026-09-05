# AI 聊天 Markdown 渲染修复

日期：2026-09-05（UTC+08:00）

开发基线：`dev` / `ebde982`。用户反馈命盘 AI 回复偶尔直接显示 Markdown 符号，本轮修复显示层，SQLite 仍为 v47。

## 1. 原因与范围

命盘 `InsightPanel` 与合盘 `HemingChatPanel` 原来逐行拆分，只识别 `**加粗**` 和 `**【小标题】**`；八字 `BaziChatWorkspace` 则直接删除双星号。因此标准标题、列表、引用、表格、链接和代码块没有完整解析。流式分片截断格式时，也会暂时露出标记。

另用合成文本复现了中文标点相邻问题：`命宫的**“武曲”**星曜`、`**重点。**后续文字` 在普通 CommonMark 下不能按预期加粗，已补上中文兼容扩展。

三个在用聊天入口统一接入 `components/AiMarkdown.tsx`，覆盖命盘、命盘运限、合盘、合盘运限和八字聊天。独立报告页面和未被路由使用的旧 `ChatPanel` 不在本轮范围。消息内容、提示词、后端接口和生成生命周期不变。

## 2. 实现

| 文件或依赖 | 作用 |
|---|---|
| `components/AiMarkdown.tsx` | 共用渲染组件，历史消息使用 memo 避免随其他回复重复解析 |
| `app/ai-markdown.css`、`app/layout.tsx` | 语义元素排版、列表符号、三类聊天主题、局部横向滚动与减少动画 |
| `react-markdown` 10.1.0 | CommonMark 到 React 元素，替换逐行正则渲染 |
| `remark-gfm` 4.0.1 | 表格、任务列表、删除线、自动链接和脚注 |
| `remark-breaks` 4.0.0 | 保留模型单换行的阅读效果 |
| `remark-cjk-friendly` 2.3.1 | 中文标点附近的加粗和斜体兼容，使用仅解析入口 |
| `remend` 1.3.1 | 对流式、取消或失败的部分回复补全显示格式；完整回复保持原始 Markdown 解释 |
| `scripts/test-ai-markdown.tsx`、`scripts/fixtures/ai-markdown.ts` | 实际组件渲染断言与合成回复样例 |
| `scripts/run-ai-markdown-test.mjs` | 以 ESM 运行组件测试，使用显式开发依赖 esbuild 0.27.7，不改变其他脚本模块制式 |

关键行为：

- 标题、加粗、斜体、编号/嵌套列表、任务项、引用、表格、分隔线、代码和链接按语法呈现；原有【章节标题】保留强调色。
- 代码块里的 Markdown 符号与转义符号按字面显示，不做全局删除或解转义，不把整段 Markdown 代码示例误当正文。
- 流式或中断回复只在组件内补全格式；未完成的链接先显示文字，不打开不完整 URL。停止后不显示生成光标，刷新后的取消/失败消息仍使用部分回复处理。
- 不执行回复中的原始 HTML，沿用解析器的安全 URL 转换。图片显示为用户可主动打开的链接，不自动请求 AI 生成的远程图片地址。
- 每条消息的脚注 ID 独立，脚注和返回正文链接在当前页跳转，外部链接另开标签并带 `noopener noreferrer`。
- 正文继承既有聊天字号、字体与行距设置；表格和长代码在块内滚动，保持紧凑输入区和手机页面宽度。

本轮不新增数学公式、图表语言执行或代码语法高亮，也不猜测改写已完成但本身不合法的 Markdown。

## 3. 验收记录

组件测试验证真实 React 渲染结果，覆盖标准语法、中文标点、原有章节、换行、任务项、代码与转义、脚注隔离、不完整链接、每 23 个字符截断的流式前缀、停止/失败显示及 HTML/URL 边界。三类聊天主题共用相同解析器。

浏览器使用临时 SQLite 和本地模拟 AI，端口 30002 / 30003、缓存 `.next-markdown-qa`，全部为合成资料，无真实 AI 外呼。

| 场景 | 结果 |
|---|---|
| 1440 × 900 命盘 | 16px 正文，标题、列表、引用和中文加粗正确；表格可用宽 480px，长代码内容宽 1648px，仅代码块内部滚动 |
| 390 × 844 手机 | AI 独立字号 24px 生效；表格内容宽 600px、代码内容宽 2481px，在 319px 块内滚动；页面宽仍为 390px，输入框底部 821px |
| 完整流式回复 | 分片发送标题、未闭合加粗、表格和代码；完成后形成真实 h1/strong/table/pre，代码中的双星号保留，刷新后正确恢复 |
| 中途停止 | 未闭合加粗在生成和停止后均正确显示；刷新后仍正确；接口记录状态为 cancelled，原文保留起始标记且没有追加闭合标记；模拟上游确认一次取消 |
| 日志 | 最终浏览器 error / warn 均为空 |

手机为视口模拟，非实体设备软键盘验收。独立验收脚本已移除，Next 自动类型路径恢复默认；缓存、合成数据库和生成的测试 bundle 不进入提交。

专项测试 `test:ai-markdown`、`test:chat-preferences`、`test:chat-scroll`、`test:chat-generation`、`test:chat-keyboard` 均通过。`npx tsc --noEmit` 与生产构建通过，71 个静态页面及动态路由编译完成。日常开发服务恢复到 30001。

## 4. 官方参考

- [react-markdown：语法、组件及安全 URL](https://github.com/remarkjs/react-markdown)
- [remark-gfm：扩展语法](https://github.com/remarkjs/remark-gfm)
- [中文强调兼容说明](https://github.com/tats-u/markdown-cjk-friendly/tree/main/packages/remark-cjk-friendly)
- [Remend：流式格式补全](https://github.com/vercel/streamdown/tree/main/packages/remend)
