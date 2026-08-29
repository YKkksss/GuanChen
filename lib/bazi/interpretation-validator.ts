import type { BaziInterpretationMethodology } from './interpretation-types';

export function validateBaziInterpretationMethodology(methodology: BaziInterpretationMethodology): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('解释方法论结构版本必须为 1');
  if (!methodology.version.trim() || !methodology.engineVersion.trim()) errors.push('解释方法论和引擎版本不能为空');
  if (methodology.strengthPolicy.outputMode !== 'evidence_balance_without_numeric_score') errors.push('旺衰首版必须使用非数字证据审计');
  if (methodology.strengthPolicy.monthCommandPriority !== 'primary_not_exclusive') errors.push('月令必须优先但不能作为唯一判断');
  if (methodology.patternPolicy.storageMonthPolicy !== 'multi_candidate_manual_review') errors.push('杂气月必须保留多候选人工复核');
  if (methodology.usefulGodPolicy.terminologyPolicy !== 'never_merge_pattern_and_balancing_meanings') errors.push('格局用神和扶抑用神不得混用');
  for (const method of ['month_command_pattern', 'balancing', 'climate', 'flow'] as const) {
    if (!methodology.usefulGodPolicy.separateMethods.includes(method)) errors.push(`缺少取用方法：${method}`);
  }
  for (const source of ['ziping-zhenquan-original', 'ditiansui-chanwei-wikisource', 'sanming-tonghui-month-command', 'qiongtong-baojian-wikisource']) {
    if (!methodology.sources.some(item => item.id === source)) errors.push(`缺少方法来源：${source}`);
  }
  for (const rule of ['用单一五行数量或固定加权分数判定身强身弱', '把候选元素称为最终用神、喜神或忌神']) {
    if (!methodology.prohibitedClaims.includes(rule)) errors.push(`缺少安全限制：${rule}`);
  }
  if (new Set(methodology.sources.map(source => source.id)).size !== methodology.sources.length) errors.push('解释来源编号不能重复');
  return errors;
}

export function assertValidBaziInterpretationMethodology(methodology: BaziInterpretationMethodology): void {
  const errors = validateBaziInterpretationMethodology(methodology);
  if (errors.length) throw new Error(`八字解释方法论校验失败：${errors.join('；')}`);
}
