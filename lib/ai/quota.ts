import { consumeAiUsage } from '@/lib/auth/accounts';
import { currentUser } from '@/lib/auth/scope';

export class AiQuotaError extends Error {
  readonly code = 'AI_QUOTA_EXCEEDED';
  readonly status = 429;
  constructor(limit: number) {
    super(`今日 AI 调用额度已用完（每账号 ${limit} 次）。请明天再试，或由部署者调整 AI_DAILY_LIMIT。`);
  }
}

/**
 * 在调用供应商前按账号扣减当日额度。脚本/无登录上下文不扣减；
 * AI_DAILY_LIMIT=0 或未设置时使用默认 200，负数表示不限制。
 */
export function assertAiQuota() {
  const user = currentUser();
  if (!user) return;
  const configured = process.env.AI_DAILY_LIMIT === undefined ? 200 : Number(process.env.AI_DAILY_LIMIT);
  if (!Number.isFinite(configured) || configured < 0) return;
  const limit = Math.floor(configured);
  if (limit === 0) return;
  const result = consumeAiUsage(user.id, limit);
  if (!result.allowed) throw new AiQuotaError(result.limit);
}
