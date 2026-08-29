import { BAZI_TRANSPARENCY_ROOT_METHODOLOGY } from './transparency-root-methodology';
import type { BaziTransparencyRootMethodology } from './transparency-root-types';

export function validateBaziTransparencyRootMethodology(
  methodology: BaziTransparencyRootMethodology = BAZI_TRANSPARENCY_ROOT_METHODOLOGY,
): string[] {
  const errors: string[] = [];
  if (!methodology.version || !methodology.engineVersion) errors.push('方法版本和引擎版本不能为空');
  if (methodology.policy.upstreamPolicy !== 'consume_versioned_repeat_clusters_and_dynamic_occurrences') errors.push('必须消费 M9-9 重复簇与动态位置');
  if (methodology.policy.transparencyPolicy !== 'exact_hidden_stem_to_surface_stem_in_same_segment') errors.push('透出匹配必须要求同片段完全同干');
  if (methodology.policy.monthCommandPolicy !== 'label_natal_month_hidden_stem_separately') errors.push('月令藏干必须单独标记');
  if (methodology.policy.rootPolicy !== 'separate_exact_same_stem_from_same_element_support') errors.push('必须区分完全同干根与仅同五行支持');
  if (methodology.policy.selfSeatPolicy !== 'same_node_exact_hidden_only') errors.push('坐支位置必须要求同节点完全同干');
  if (methodology.policy.dynamicPolicy !== 'require_dynamic_occurrence_in_each_candidate') errors.push('岁运候选必须包含动态位置');
  if (methodology.policy.scoringPolicy !== 'no_strength_weight_no_fortune_verdict') errors.push('不得生成强弱权重或吉凶裁决');
  if (!methodology.prohibitedClaims.some(item => item.includes('真假根'))) errors.push('必须禁止真假根裁决');
  if (!methodology.prohibitedClaims.some(item => item.includes('透干有效'))) errors.push('必须禁止透干有效性裁决');
  if (!methodology.sources.some(item => item.id.includes('ziping'))) errors.push('必须保留月令透干经典来源');
  if (!methodology.sources.some(item => item.id.includes('m9-9'))) errors.push('必须绑定 M9-9 上游方法');
  return errors;
}

export function assertValidBaziTransparencyRootMethodology(
  methodology: BaziTransparencyRootMethodology = BAZI_TRANSPARENCY_ROOT_METHODOLOGY,
): void {
  const errors = validateBaziTransparencyRootMethodology(methodology);
  if (errors.length) throw new Error(`八字透干与通根方法配置无效：${errors.join('；')}`);
}
