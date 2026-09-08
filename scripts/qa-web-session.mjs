import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// 全链路验收专用：真实应用与独立 SQLite，仅供应商响应由本机模拟。
const directory = process.env.GUANCHEN_QA_DIRECTORY
  ? path.resolve(process.env.GUANCHEN_QA_DIRECTORY)
  : mkdtempSync(path.join(tmpdir(), 'guanchen-full-qa-'));
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) {
  throw new Error('验收目录必须是系统临时目录下的 guanchen-full-qa-* 独立目录');
}
let mode = 'normal';
const mock = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/__qa/')) {
    mode = req.url.split('/').at(-1);
    res.end(JSON.stringify({ mode }));
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    const input = JSON.parse(raw);
    appendFileSync(path.join(directory, 'ai-requests.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, stream: input.stream, messages: input.messages }) + '\n');
    if (mode === 'fail') { res.writeHead(503); res.end('QA 模拟供应商不可用'); return; }
    const all = input.messages.map(item => item.content).join('\n');
    const line = label => all.split('\n').find(item => item.startsWith(label))?.slice(label.length);
    const sectionText = line('【必须输出的章节】') ?? line('【章节】');
    let content = '## 测试回复\n\n这是本地模拟供应商生成的 **验收内容**，用于检查流式显示与保存。\n\n- 核对当前命盘事实\n- 记录已确认的现实反馈\n\n不替代真实模型质量验收。';
    if (sectionText) {
      const sections = JSON.parse(sectionText);
      const evidence = JSON.parse(line('【可引用的权威证据】') ?? line('【可引用证据】') ?? '[]');
      content = JSON.stringify({ title: 'QA 专项验收报告', summary: '本报告由本机模拟供应商生成，用于验证完整生成、持久化、版本与导出链路。',
        sections: sections.map((item, i) => ({ ...item, content: `${item.title}：这是第 ${i + 1} 节独立验收内容。综合观察：仅核对给定事实与引用，不补造经历。请记录本节观察结果，后续结合实际反馈复核。`, evidenceIds: evidence[i] ? [evidence[i].id ?? evidence[i].evidenceKey] : [] })),
        actionItems: ['记录一条观察及日期，下次回顾时核对变化。'], openQuestions: ['哪些现实信息仍需要补充？'] });
    } else if (all.includes('你是人生事件候选提取器')) {
      const source = JSON.parse(input.messages.at(-1).content).user_message;
      content = JSON.stringify({ candidates: source.includes('QA候选') ? [
        { title: 'QA候选：入职', category: 'career', startDate: '2018-06-15', datePrecision: 'day', description: '仅用于验收的合成经历', impactLevel: 3, confidence: 0.95, sourceExcerpt: source, reviewNotes: [] },
        { title: 'QA候选：搬家', category: 'relocation', startDate: '2019', datePrecision: 'year', description: '仅用于验收的合成经历', impactLevel: 3, confidence: 0.95, sourceExcerpt: source, reviewNotes: [] },
      ] : [] });
    } else if (all.includes('你负责压缩八字规则证据对话')) {
      content = JSON.stringify({ topicsDiscussed: ['QA 八字功能验收'], explainedFacts: [], userQuestions: [], corrections: [], openQuestions: [], boundariesReiterated: [], doNotAssume: [] });
    } else if (all.includes('记忆提取器')) {
      content = JSON.stringify({ items: [] });
    } else if (all.includes('滚动对话摘要器')) {
      content = JSON.stringify({ user_context: [], confirmed_events: [], topics_discussed: ['QA 网页功能验收'], previous_conclusions: [], corrections: [], open_questions: [], user_preferences: [], disputed_or_uncertain: [], do_not_assume: [] });
    } else if (all.includes('【程序评分结果】')) {
      content = JSON.stringify({ summary: '本地验收反馈：请以程序评分为准核对覆盖情况。', strengths: ['答案已提交并保存。'], omissions: [], factIssues: [], reasoningSuggestions: ['逐项回查程序证据。'], expressionSuggestions: ['区分事实与解释。'], nextRevisionPriorities: ['按评分量表补充遗漏。'] });
    }
    if (!input.stream) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 150 } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (let i = 0; i < content.length; i += 8) {
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 8) } }] })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 300 : 15));
    }
    res.end('data: [DONE]\n\n');
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
mock.listen(30003, '127.0.0.1', () => {
  const production = process.env.GUANCHEN_QA_PRODUCTION === '1';
  const env = { ...process.env, SQLITE_PATH: path.join(directory, 'test.sqlite'), REPORT_EXPORT_DIR: path.join(directory, 'exports'), ZIWEI_NEXT_DIST_DIR: production ? '.next-qa-production' : '.next-full-qa',
    AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'qa-local-only', DEEPSEEK_BASE_URL: 'http://127.0.0.1:30003', DEEPSEEK_MODEL: 'deepseek-chat' };
  writeFileSync(path.join(directory, 'session.json'), JSON.stringify({ directory, appUrl: 'http://127.0.0.1:30002', sqlitePath: env.SQLITE_PATH }));
  console.log(`QA_DIRECTORY=${directory}`);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(production ? ['start'] : ['dev', '--turbopack']), '-H', '127.0.0.1', '-p', '30002'], { env, stdio: 'inherit', windowsHide: true });
  const stop = () => { child.kill(); mock.close(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', () => { mock.close(); process.exitCode = 0; });
});
