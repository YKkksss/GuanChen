import { loadEnvConfig } from '@next/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createChatCompletion, getProviderConfig } from '../lib/ai/deepseek';

loadEnvConfig(process.cwd());

const output = path.resolve(process.env.AI_SMOKE_OUT || 'docs/qa-evidence/2026-10-18-v2.0-p5-ai-smoke.json');
const cases = [
  {
    id: 'chart',
    system: '你是观辰紫微命盘的解释助手。只解释程序给出的事实，不宣告现实命运或具体事件。',
    user: '请用两句话说明：命盘的宫位与星曜适合怎样解释，为什么不能据此宣告具体事件？',
  },
  {
    id: 'bazi',
    system: '你是观辰八字论命的解释助手。只解释给定四柱与规则条件，不裁定最终喜用。',
    user: '请用两句话说明：月令、透干、旺衰证据为什么不能直接等同于最终喜用？',
  },
  {
    id: 'report',
    system: '你是观辰命理报告生成助手。输出简洁中文，保留边界。',
    user: '写三行摘要：一份命理报告应如何保留条件、不确定性和现实反馈空间？',
  },
  {
    id: 'divination',
    system: '你是观辰独立术数的解释助手。只解释结构条件，不断定现实结果。',
    user: '请用两句话说明：六爻、梅花或奇门中的结构出现，为什么不等于现实事件已经发生？',
  },
];

const forbidden = /必定|注定|百分百|一定会|唯一用神|最终用神/;
const maxTokens = Number(process.env.AI_SMOKE_MAX_TOKENS || 180);
const priceInput = Number(process.env.AI_PRICE_INPUT_PER_M || 0);
const priceOutput = Number(process.env.AI_PRICE_OUTPUT_PER_M || 0);

async function main() {
  const config = getProviderConfig();
  const hasKey = Boolean(config.apiKey && config.baseUrl && config.model);
  const startedAt = new Date().toISOString();
  if (!hasKey) {
    const report = {
      at: startedAt,
      passed: true,
      skipped: true,
      reason: 'NO_AI_KEY',
      note: '未配置供应商密钥；跳过真实模型冒烟，不发起请求。',
    };
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const results: Array<{
    id: string;
    passed: boolean;
    latencyMs: number;
    usage?: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null };
    length?: number;
    excerpt?: string;
    error?: string;
  }> = [];
  let passed = true;
  for (const item of cases) {
    const started = Date.now();
    try {
      const result = await createChatCompletion([
        { role: 'system', content: item.system },
        { role: 'user', content: item.user },
      ], { maxTokens, temperature: 0.2, thinking: false, signal: AbortSignal.timeout(60_000) });
      const content = result.content.trim();
      const casePassed = content.length >= 20 && !forbidden.test(content);
      if (!casePassed) passed = false;
      results.push({
        id: item.id,
        passed: casePassed,
        latencyMs: Date.now() - started,
        usage: result.usage,
        length: content.length,
        excerpt: content.slice(0, 240),
      });
    } catch (error) {
      passed = false;
      results.push({
        id: item.id,
        passed: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const inputTokens = results.reduce((sum, item) => sum + (item.usage?.inputTokens ?? 0), 0);
  const outputTokens = results.reduce((sum, item) => sum + (item.usage?.outputTokens ?? 0), 0);
  const estimatedCost = priceInput > 0 || priceOutput > 0
    ? Number(((inputTokens / 1_000_000) * priceInput + (outputTokens / 1_000_000) * priceOutput).toFixed(6))
    : null;
  const report = {
    at: startedAt,
    passed,
    skipped: false,
    provider: config.provider,
    model: config.model,
    requestCount: cases.length,
    maxTokensPerRequest: maxTokens,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    estimatedCostUsd: estimatedCost,
    pricingNote: estimatedCost === null ? '未设置 AI_PRICE_INPUT_PER_M / AI_PRICE_OUTPUT_PER_M，未估算金额。' : '按环境变量单价估算，仅作量级参考。',
    results,
    scope: '四类合成短文冒烟：命盘问答、八字论命、报告摘要、独立术数；不含真实用户资料。',
    limitation: '不是完整应用链路、报告校验或真实解读质量评估。',
  };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = passed ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
