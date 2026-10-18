const SENSITIVE_KEY = /(?:password|passwd|secret|token|cookie|authorization|api[-_]?key|session)/i;
const MAX_STRING = 2000;

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  event: string;
  level?: LogLevel;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  userId?: string | null;
  role?: string;
  errorName?: string;
  [key: string]: unknown;
}

/** 只做结构化事件记录；不接收请求体、聊天正文、密码或密钥。 */
export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redactLogValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactLogValue(item, depth + 1);
    }
    return result;
  }
  return undefined;
}

export function logEvent(event: LogEvent) {
  const payload = {
    ts: new Date().toISOString(),
    level: event.level ?? 'info',
    ...(redactLogValue(event) as Record<string, unknown>),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
