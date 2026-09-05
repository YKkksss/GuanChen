'use client';

import React, { memo, useId, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly';
import remend from 'remend';

interface AiMarkdownProps {
  text: string;
  streaming?: boolean;
  incomplete?: boolean;
  reduceMotion?: boolean;
  theme?: 'eastern' | 'heming' | 'bazi';
}

const plugins = [remarkGfm, remarkCjkFriendly, remarkBreaks];
const components: Components = {
  // 兼容既有提示词的【章节标题】，普通加粗仍按 Markdown 解析。
  strong: ({ children }) => <strong className={typeof children === 'string' && /^【[^\n]+】$/.test(children) ? 'ai-markdown-section' : undefined}>{children}</strong>,
  // AI 生成的图片地址不自动发起请求，用户可自行打开图片链接。
  img: ({ src, alt }) => src
    ? <a href={src} target="_blank" rel="noopener noreferrer">图片：{alt || '查看图片'}</a>
    : <span>{alt}</span>,
  table: ({ children }) => <div className="ai-markdown-table" role="region" aria-label="AI 回复表格，可横向滚动" tabIndex={0}><table>{children}</table></div>,
  pre: ({ children }) => <pre tabIndex={0} aria-label="代码块，可横向滚动">{children}</pre>,
};

/** 仅修补流式或中断回复的显示文本，绝不改写保存的原始消息。 */
function AiMarkdown({ text, streaming = false, incomplete = false, reduceMotion = false, theme = 'eastern' }: AiMarkdownProps) {
  const id = useId();
  const footnoteLabelId = `ai-${id}-footnote-label`;
  const scopedComponents = useMemo<Components>(() => ({
    ...components,
    a: ({ node, href, children, ...props }) => href
      ? <a {...props} href={href} aria-describedby={props['aria-describedby'] === 'footnote-label' ? footnoteLabelId : props['aria-describedby']}
          target={href.startsWith('#') ? undefined : '_blank'} rel={href.startsWith('#') ? undefined : 'noopener noreferrer'}>{children}</a>
      : <span>{children}</span>,
    h2: ({ node, id: headingId, ...props }) => <h2 {...props} id={headingId === 'footnote-label' ? footnoteLabelId : headingId} />,
  }), [footnoteLabelId]);
  const content = useMemo(() => streaming || incomplete
    ? remend(text, { katex: false, inlineKatex: false, linkMode: 'text-only', comparisonOperators: false })
    : text, [text, streaming, incomplete]);

  return <div className={`ai-markdown ai-markdown--${theme}${theme === 'eastern' ? ' eastern-ai-content' : ''}`} data-reduce-motion={reduceMotion}>
    <Markdown remarkPlugins={plugins} components={scopedComponents} remarkRehypeOptions={{ clobberPrefix: `ai-${id}-`, footnoteLabel: '脚注', footnoteBackLabel: '返回正文' }} skipHtml>{content}</Markdown>
    {streaming && <span className="ai-markdown-cursor" aria-hidden="true" />}
  </div>;
}

export default memo(AiMarkdown);
