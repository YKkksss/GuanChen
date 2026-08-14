import { PALACE_NAMES_ORDER } from '@/lib/ziwei/constants';
import type {
  HemingMethodology,
  HemingPalaceRef,
  HemingRuleCondition,
  HemingRuleDefinition,
  PalaceName,
} from './types';
import { RELATIONSHIP_TYPES } from './types';

const VALID_PALACES = new Set(PALACE_NAMES_ORDER as PalaceName[]);

export function validateHemingMethodology(methodology: HemingMethodology): string[] {
  const errors: string[] = [];
  if (!methodology.version.trim()) errors.push('方法论版本不能为空');
  validateSchoolPolicy(methodology, errors);
  validateRelationships(methodology, errors);
  validateRules(methodology, errors);
  return [...new Set(errors)];
}

export function assertValidHemingMethodology(methodology: HemingMethodology): void {
  const errors = validateHemingMethodology(methodology);
  if (errors.length) throw new Error(`合盘方法论校验失败：\n- ${errors.join('\n- ')}`);
}

function validateSchoolPolicy(methodology: HemingMethodology, errors: string[]) {
  const { allowedFacts, forbiddenFacts, principles } = methodology.schoolPolicy;
  if (!allowedFacts.length) errors.push('流派策略必须声明允许事实');
  if (!forbiddenFacts.length) errors.push('流派策略必须声明禁用事实');
  if (!principles.length) errors.push('流派策略必须声明基本原则');
  const forbidden = new Set(forbiddenFacts);
  for (const fact of allowedFacts) {
    if (forbidden.has(fact)) errors.push(`事实 ${fact} 不能同时允许和禁用`);
  }
  for (const required of ['palace_self_sihua', 'cross_chart_flying_sihua', 'model_invented_chart_fact']) {
    if (!forbidden.has(required)) errors.push(`流派策略必须禁用 ${required}`);
  }
}

function validateRelationships(methodology: HemingMethodology, errors: string[]) {
  const seen = new Set<string>();
  for (const definition of methodology.relationships) {
    if (seen.has(definition.type)) errors.push(`关系类型重复：${definition.type}`);
    seen.add(definition.type);
    if (definition.roles.length !== 2 || definition.roles[0].owner !== 'A' || definition.roles[1].owner !== 'B') {
      errors.push(`关系 ${definition.type} 必须按 A、B 顺序定义两个角色`);
    }
    if (!definition.requiredRealityContext.length) {
      errors.push(`关系 ${definition.type} 必须声明现实上下文字段`);
    }
    const dimensionIds = new Set<string>();
    for (const dimension of definition.dimensions) {
      if (dimensionIds.has(dimension.id)) errors.push(`关系 ${definition.type} 的分析维度重复：${dimension.id}`);
      dimensionIds.add(dimension.id);
      if (!dimension.ownerAPalaces.length || !dimension.ownerBPalaces.length) {
        errors.push(`关系 ${definition.type} 的维度 ${dimension.id} 必须同时声明甲乙双方宫位`);
      }
      for (const palace of [...dimension.ownerAPalaces, ...dimension.ownerBPalaces]) {
        if (!VALID_PALACES.has(palace)) errors.push(`关系 ${definition.type} 使用未知宫位：${palace}`);
      }
    }
    for (const common of ['interaction_style', 'stage_timing']) {
      if (!dimensionIds.has(common)) errors.push(`关系 ${definition.type} 缺少通用维度：${common}`);
    }
  }
  for (const type of RELATIONSHIP_TYPES) {
    if (!seen.has(type)) errors.push(`缺少关系类型：${type}`);
  }
}

function validateRules(methodology: HemingMethodology, errors: string[]) {
  const ruleIds = new Set<string>();
  const ruleById = new Map(methodology.rules.map(rule => [rule.id, rule]));
  for (const rule of methodology.rules) {
    if (ruleIds.has(rule.id)) errors.push(`规则编号重复：${rule.id}`);
    ruleIds.add(rule.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id)) errors.push(`规则编号不符合 kebab-case：${rule.id}`);
    if (rule.priority < 1 || rule.priority > 100) errors.push(`规则 ${rule.id} 优先级必须在 1-100`);
    if (!rule.conditions.length) errors.push(`规则 ${rule.id} 缺少触发条件`);
    if (!rule.source.references.length) errors.push(`规则 ${rule.id} 缺少方法论引用`);
    if (!rule.evidenceOwners.length) errors.push(`规则 ${rule.id} 缺少证据归属`);

    for (const type of rule.relationshipTypes) {
      const relationship = methodology.relationships.find(item => item.type === type);
      if (!relationship) {
        errors.push(`规则 ${rule.id} 使用未知关系类型：${type}`);
      } else if (!relationship.dimensions.some(item => item.id === rule.dimensionId)) {
        errors.push(`规则 ${rule.id} 的维度 ${rule.dimensionId} 不属于关系 ${type}`);
      }
    }

    const conditionOwners = new Set<'A' | 'B'>();
    for (const condition of rule.conditions) {
      validateCondition(rule, condition, errors);
      for (const owner of getConditionOwners(condition)) conditionOwners.add(owner);
    }
    if (conditionOwners.has('A') && conditionOwners.has('B')) {
      for (const owner of ['A', 'B', 'interaction'] as const) {
        if (!rule.evidenceOwners.includes(owner)) errors.push(`跨盘规则 ${rule.id} 必须包含 ${owner} 证据归属`);
      }
    }

    const copy = `${rule.name}\n${rule.conclusionTemplate}\n${rule.adviceTemplate}`;
    for (const phrase of methodology.prohibitedPhrases) {
      if (copy.includes(phrase)) errors.push(`规则 ${rule.id} 使用禁用表达：${phrase}`);
    }
    for (const conflictId of rule.conflictsWith) {
      const conflict = ruleById.get(conflictId);
      if (!conflict) errors.push(`规则 ${rule.id} 引用了不存在的冲突规则：${conflictId}`);
      else if (!conflict.conflictsWith.includes(rule.id)) errors.push(`规则冲突必须双向声明：${rule.id} ↔ ${conflictId}`);
    }
  }
}

function validateCondition(rule: HemingRuleDefinition, condition: HemingRuleCondition, errors: string[]) {
  switch (condition.kind) {
    case 'star_overlap':
      validatePalaceRef(rule.id, condition.left, errors);
      validatePalaceRef(rule.id, condition.right, errors);
      if (condition.left.owner === condition.right.owner) errors.push(`规则 ${rule.id} 的 star_overlap 必须跨盘比较`);
      if (condition.minCount < 1) errors.push(`规则 ${rule.id} 的重合数量必须大于 0`);
      break;
    case 'star_category_count':
    case 'natal_sihua_present':
    case 'palace_empty':
      validatePalaceRef(rule.id, condition.target, errors);
      break;
    case 'stage_focus_in':
      for (const palace of condition.palaces) {
        if (!VALID_PALACES.has(palace)) errors.push(`规则 ${rule.id} 使用未知阶段宫位：${palace}`);
      }
      break;
    case 'birth_time_known':
    case 'confirmed_context_present':
      break;
  }
}

function validatePalaceRef(ruleId: string, ref: HemingPalaceRef, errors: string[]) {
  if (!VALID_PALACES.has(ref.palace)) errors.push(`规则 ${ruleId} 使用未知宫位：${ref.palace}`);
}

function getConditionOwners(condition: HemingRuleCondition): Array<'A' | 'B'> {
  switch (condition.kind) {
    case 'star_overlap': return [condition.left.owner, condition.right.owner];
    case 'star_category_count':
    case 'natal_sihua_present':
    case 'palace_empty': return [condition.target.owner];
    case 'birth_time_known':
    case 'stage_focus_in': return [condition.owner];
    case 'confirmed_context_present': return [];
  }
}
