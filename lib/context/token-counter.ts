import type { ChatMessage } from '@/lib/ai/deepseek';

/**
 * 无供应商 tokenizer 时使用的保守估算。中文通常按一字一个 Token，
 * 拉丁字符按约四字符一个 Token，并为每条消息预留协议开销。
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjk = text
    .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, '')
    .replace(/\s+/g, '');
  return cjk + Math.ceil(nonCjk.length / 4);
}

export function estimateMessageTokens(message: ChatMessage): number {
  return estimateTextTokens(message.content) + 6;
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 3);
}

export function truncateTextToTokens(text: string, maxTokens: number): string {
  if (estimateTextTokens(text) <= maxTokens) return text;
  if (maxTokens <= 0) return '';

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTextTokens(text.slice(0, middle)) <= maxTokens) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}
