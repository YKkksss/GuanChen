import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AiMarkdown from '../components/AiMarkdown';
import { MARKDOWN_REPLY } from './fixtures/ai-markdown';

const render = (text: string, props: Partial<React.ComponentProps<typeof AiMarkdown>> = {}) => renderToStaticMarkup(<AiMarkdown text={text} {...props} />);
const html = render(MARKDOWN_REPLY);
for (const tag of ['h1', 'h2', 'h3', 'strong', 'em', 'del', 'ol', 'ul', 'li', 'blockquote', 'table', 'thead', 'tbody', 'pre', 'code']) {
  assert.match(html, new RegExp(`<${tag}(?:\\s|>)`), `${tag} 应输出真实语义元素`);
}
assert.match(html, /<strong>加粗重点<\/strong>/);
assert.match(html, /class="ai-markdown-section">【核心观察】<\/strong>/);
assert.match(html, /<br\/>\n同一段的第二行/);
assert.match(html, /<input type="checkbox" disabled="" checked=""\/>/);
assert.match(html, /AI 回复表格，可横向滚动/);
assert.match(html, /代码块，可横向滚动/);
assert.match(html, /# 这是代码内容，应保留 Markdown 符号\n\*\*不是加粗\*\*/);
assert.match(html, /转义示例：\*保留星号\*/);
assert.match(html, /普通范围 20~25/);
assert.match(html, /href="https:\/\/commonmark.org\/help\/" target="_blank" rel="noopener noreferrer"/);
assert.match(render('命宫的**“武曲”**星曜'), /<strong>“武曲”<\/strong>/);
assert.match(render('**重点。**后续文字'), /<strong>重点。<\/strong>后续文字/);
const notes = renderToStaticMarkup(<><AiMarkdown text={'说明[^1]\n\n[^1]: 第一条脚注'} /><AiMarkdown text={'说明[^1]\n\n[^1]: 第二条脚注'} /></>);
const noteIds = [...notes.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(noteIds).size, noteIds.length, '不同消息中的脚注不能出现重复 ID');
assert.doesNotMatch(notes, /href="#[^"]+"[^>]*target=/);

// 分片恰好截断格式标记时，显示层完成格式，完整回复仍按原文解释。
assert.match(render('这是**尚未结束', { streaming: true }), /<strong>尚未结束<\/strong>/);
assert.match(render('这是**尚未结束', { incomplete: true }), /<strong>尚未结束<\/strong>/);
assert.match(render('这是**尚未结束'), /这是\*\*尚未结束/);
assert.doesNotMatch(render('这是**尚未结束', { incomplete: true }), /class="ai-markdown-cursor"/);
assert.match(render('查看[说明](https://exam', { streaming: true }), /查看说明/);
assert.doesNotMatch(render('查看[说明](https://exam', { streaming: true }), /href=/);
assert.match(render('```text\n**保留原文', { streaming: true }), /<code class="language-text">\*\*保留原文/);
for (let end = 1; end <= MARKDOWN_REPLY.length; end += 23) assert.doesNotThrow(() => render(MARKDOWN_REPLY.slice(0, end), { streaming: true }));

// 不执行 HTML、不允许脚本协议，图片由用户主动打开，代码字面量不被破坏。
const unsafe = render('<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n![图片](https://example.com/pixel.png)\n\n`<script>字面代码</script>`');
assert.doesNotMatch(unsafe, /<script|javascript:|<img/);
assert.match(unsafe, /&lt;script&gt;字面代码&lt;\/script&gt;/);
assert.match(unsafe, /href="https:\/\/example.com\/pixel.png"/);
for (const theme of ['eastern', 'heming', 'bazi'] as const) assert.match(render('**共用渲染**', { theme }), /<strong>共用渲染<\/strong>/);
console.log('AI Markdown 验收通过：标准语法、中文章节、表格代码、转义、流式分片、中断保留、链接与 HTML 边界、三类聊天共用渲染。');
