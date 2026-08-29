import { BAZI_DYNAMIC_TEN_GOD_METHODOLOGY } from './dynamic-ten-god-methodology';
import type { BaziDynamicTenGodMethodology } from './dynamic-ten-god-types';

export function validateBaziDynamicTenGodMethodology(
  methodology: BaziDynamicTenGodMethodology = BAZI_DYNAMIC_TEN_GOD_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.tenGodReference !== 'day_master_stem') errors.push('十神必须以日主天干为参照');
  if (methodology.policy.hiddenStemPolicy !== 'role_metadata_only_no_activation_claim') errors.push('藏干只能记录角色，不得宣告引动');
  if (methodology.policy.directionPolicy !== 'consume_versioned_cross_layer_relation_evidence') errors.push('作用方向必须消费版本化跨层关系证据');
  if (methodology.policy.targetPolicy !== 'natal_pillar_only') errors.push('首版作用目标必须限定到原局柱位');
  if (methodology.policy.scoringPolicy !== 'no_numeric_score_no_strength_or_fortune_weight') errors.push('不得生成强弱或吉凶分数');
  if (methodology.tenGodNames.length !== 10 || new Set(methodology.tenGodNames).size !== 10) errors.push('十神名称必须完整且不重复');
  if (Object.keys(methodology.hiddenStemOrder).length !== 12) errors.push('十二地支藏干顺序必须完整');
  if (!methodology.prohibitedClaims.some(item => item.includes('透出'))) errors.push('必须禁止把藏干直接宣告为透出');
  if (!methodology.prohibitedClaims.some(item => item.includes('人物'))) errors.push('必须禁止十神到人物或事件的直接映射');
  if (!methodology.sources.some(item => item.type === 'official_implementation')) errors.push('至少需要一条官方实现来源');
  if (!methodology.sources.some(item => item.id.includes('m9-6-m9-7'))) errors.push('必须绑定 M9-6 与 M9-7 上游证据');
  return errors;
}

export function assertValidBaziDynamicTenGodMethodology(
  methodology: BaziDynamicTenGodMethodology = BAZI_DYNAMIC_TEN_GOD_METHODOLOGY,
): void {
  const errors = validateBaziDynamicTenGodMethodology(methodology);
  if (errors.length) throw new Error(`八字动态十神方法配置无效：${errors.join('；')}`);
}
