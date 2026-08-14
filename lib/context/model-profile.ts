export interface ModelProfile {
  provider: string;
  model: string;
  contextLimit: number;
  targetInputTokens: number;
  outputReserve: number;
  safetyMargin: number;
}

export function getModelProfile(provider: string, model: string): ModelProfile {
  const contextLimit = readPositiveInteger('AI_CONTEXT_LIMIT', 32_768);
  const outputReserve = readPositiveInteger('AI_OUTPUT_RESERVE', 2_400);
  const safetyMargin = Math.max(
    readPositiveInteger('AI_CONTEXT_SAFETY_MARGIN', 1_000),
    Math.ceil(contextLimit * 0.05),
  );
  const hardInputLimit = Math.max(contextLimit - outputReserve - safetyMargin, 1_000);
  const targetInputTokens = Math.min(
    readPositiveInteger('AI_INPUT_TOKEN_TARGET', 12_000),
    hardInputLimit,
  );

  return {
    provider,
    model,
    contextLimit,
    targetInputTokens,
    outputReserve,
    safetyMargin,
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
