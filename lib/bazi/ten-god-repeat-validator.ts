import { BAZI_TEN_GOD_REPEAT_METHODOLOGY } from './ten-god-repeat-methodology';
import type { BaziTenGodRepeatMethodology } from './ten-god-repeat-types';

export function validateBaziTenGodRepeatMethodology(
  methodology: BaziTenGodRepeatMethodology = BAZI_TEN_GOD_REPEAT_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_dynamic_ten_god_and_relation_evidence') errors.push('必须消费 M9-8 动态十神和版本化关系证据');
  if (methodology.policy.occurrencePolicy !== 'preserve_surface_hidden_and_day_master_reference') errors.push('必须区分表层、藏干与日主参照');
  if (methodology.policy.clusterPolicy !== 'require_dynamic_occurrence_and_at_least_two_occurrences') errors.push('重复簇必须包含动态节点且至少出现两次');
  if (methodology.policy.visibilityPolicy !== 'coexistence_only_no_transparency_or_root_verdict') errors.push('显隐同见不得自动裁决透干或通根');
  if (methodology.policy.connectionPolicy !== 'exact_surface_participants_from_relation_evidence_only') errors.push('证据连接必须来自精确表层关系参与节点');
  if (methodology.policy.scoringPolicy !== 'counts_only_no_strength_or_fortune_weight') errors.push('重复计数不得转化为强弱或吉凶权重');
  if (Object.keys(methodology.repeatPatterns).length !== 4) errors.push('四类重复模式必须完整');
  if (!methodology.prohibitedClaims.some(item => item.includes('透干'))) errors.push('必须禁止显隐同见直接等同透干');
  if (!methodology.prohibitedClaims.some(item => item.includes('力量'))) errors.push('必须禁止重复次数折算力量');
  if (!methodology.sources.some(item => item.type === 'official_implementation')) errors.push('至少需要一条官方实现来源');
  if (!methodology.sources.some(item => item.id.includes('m9-8'))) errors.push('必须绑定 M9-8 上游方法');
  return errors;
}

export function assertValidBaziTenGodRepeatMethodology(
  methodology: BaziTenGodRepeatMethodology = BAZI_TEN_GOD_REPEAT_METHODOLOGY,
): void {
  const errors = validateBaziTenGodRepeatMethodology(methodology);
  if (errors.length) throw new Error(`八字十神显隐重复方法配置无效：${errors.join('；')}`);
}
