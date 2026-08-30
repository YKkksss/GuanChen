type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatStreamOptions {
  temperature?: number;
  maxTokens?: number;
  thinking?: boolean;
}

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatCompletionResult {
  content: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
  };
}

export function getProviderConfig(): ProviderConfig {
  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();

  if (provider === 'mimo') {
    return {
      provider,
      apiKey: process.env.MIMO_API_KEY || '',
      baseUrl: process.env.MIMO_BASE_URL || '',
      model: process.env.MIMO_MODEL || '',
    };
  }

  return {
    provider,
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatStreamOptions = {},
): Promise<ChatCompletionResult> {
  const config = getProviderConfig();
  assertProviderConfig(config);
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1_000,
      ...(config.provider === 'deepseek'
        ? { thinking: { type: options.thinking ? 'enabled' : 'disabled' } }
        : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI 请求失败：${res.status}${detail ? ` ${detail.slice(0, 300)}` : ''}`);
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      prompt_cache_hit_tokens?: unknown;
      cached_tokens?: unknown;
    };
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI 返回内容为空');
  return {
    content,
    usage: {
      inputTokens: toNullableNumber(data.usage?.prompt_tokens),
      outputTokens: toNullableNumber(data.usage?.completion_tokens),
      cachedInputTokens: toNullableNumber(
        data.usage?.prompt_cache_hit_tokens ?? data.usage?.cached_tokens,
      ),
    },
  };
}

export async function createChatCompletionStream(
  messages: ChatMessage[],
  options: ChatStreamOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const config = getProviderConfig();
  assertProviderConfig(config);

  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1800,
      ...(config.provider === 'deepseek'
        ? { thinking: { type: options.thinking ? 'enabled' : 'disabled' } }
        : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI 请求失败：${res.status}${detail ? ` ${detail.slice(0, 300)}` : ''}`);
  }

  return res.body;
}

function assertProviderConfig(config: ProviderConfig): void {
  if (!config.apiKey) throw new Error('AI API Key 未配置');
  if (!config.baseUrl || !config.model) throw new Error('AI 服务地址或模型未配置');
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toClientSseStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let sentDone = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              sentDone = true;
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }

            const text = extractDeltaText(data);
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text } })}\n\n`));
            }
          }
        }
      } finally {
        if (!sentDone) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>, extraHeaders?: HeadersInit) {
  const headers = new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(stream, {
    headers,
  });
}

function extractDeltaText(data: string): string {
  try {
    const parsed = JSON.parse(data);
    const delta = parsed.choices?.[0]?.delta;
    return typeof delta?.content === 'string' ? delta.content : '';
  } catch {
    return '';
  }
}
