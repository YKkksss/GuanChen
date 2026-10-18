import { getProviderConfig } from './deepseek';

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  dailyLimit: number;
}

/** 只返回是否配置、供应商、模型与配额，不返回密钥、地址或任何请求内容。 */
export function getAiStatus(): AiStatus {
  const config = getProviderConfig();
  const raw = process.env.AI_DAILY_LIMIT;
  const parsed = raw === undefined ? 200 : Number(raw);
  const dailyLimit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  return {
    configured: Boolean(config.apiKey && config.baseUrl && config.model),
    provider: config.provider,
    model: config.model || null,
    dailyLimit,
  };
}
