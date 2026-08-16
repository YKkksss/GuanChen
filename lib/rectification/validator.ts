import { LIFE_EVENT_CATEGORIES } from '@/lib/events/types';
import { PALACE_NAMES } from '@/lib/heming/types';
import type { RectificationMethodology } from './types';
import { RECTIFICATION_TIME_SLOT_KEYS } from './types';

const VALID_PALACES = new Set<string>(PALACE_NAMES);
const VALID_CATEGORIES = new Set<string>(LIFE_EVENT_CATEGORIES);

export function validateRectificationMethodology(methodology: RectificationMethodology): string[] {
  const errors: string[] = [];
  if (methodology.schemaVersion !== 1) errors.push('方法论 schemaVersion 必须为 1');
  if (!methodology.version.trim()) errors.push('方法论版本不能为空');
  if (methodology.status !== 'provisional') errors.push('V1 方法论必须标记为 provisional');
  validateTimePolicy(methodology, errors);
  validateScorePolicy(methodology, errors);
  validateTopics(methodology, errors);
  validateRules(methodology, errors);
  validateEvidencePolicy(methodology, errors);
  return [...new Set(errors)];
}

export function assertValidRectificationMethodology(methodology: RectificationMethodology): void {
  const errors = validateRectificationMethodology(methodology);
  if (errors.length) throw new Error(`校时方法论校验失败：\n- ${errors.join('\n- ')}`);
}

function validateTimePolicy(methodology: RectificationMethodology, errors: string[]) {
  const policy = methodology.timePolicy;
  if (!policy.version.trim()) errors.push('时间策略版本不能为空');
  if (policy.outputTimeScale !== 'apparent_solar_time') errors.push('V1 必须明确输出地方真太阳时');
  if (policy.timezoneSource !== 'iana_tzdb') errors.push('V1 历史时区来源必须为 IANA tzdb');
  if (policy.steps.length < 4) errors.push('时间策略必须声明完整转换步骤');
  const keys = new Set<string>();
  const engineIndices = new Set<number>();
  for (const slot of policy.slots) {
    if (keys.has(slot.key)) errors.push(`时段键重复：${slot.key}`);
    keys.add(slot.key);
    if (engineIndices.has(slot.engineTimeIndex)) errors.push(`引擎时辰序号重复：${slot.engineTimeIndex}`);
    engineIndices.add(slot.engineTimeIndex);
    if (!Number.isInteger(slot.branchIndex) || slot.branchIndex < 0 || slot.branchIndex > 11) errors.push(`时段 ${slot.key} 的地支序号必须在 0-11`);
    if (!Number.isInteger(slot.engineTimeIndex) || slot.engineTimeIndex < 0 || slot.engineTimeIndex > 12) errors.push(`时段 ${slot.key} 的引擎序号必须在 0-12`);
    if (!/^\d{2}:\d{2}$/.test(slot.apparentSolarStart) || !/^\d{2}:\d{2}$/.test(slot.apparentSolarEnd)) errors.push(`时段 ${slot.key} 的时间格式不正确`);
  }
  for (const key of RECTIFICATION_TIME_SLOT_KEYS) if (!keys.has(key)) errors.push(`缺少候选时段：${key}`);
  if (policy.slots.length !== RECTIFICATION_TIME_SLOT_KEYS.length) errors.push('V1 必须且只能定义十三个早晚子时段');
}

function validateScorePolicy(methodology: RectificationMethodology, errors: string[]) {
  const policy = methodology.scorePolicy;
  if (policy.status !== 'provisional-unvalidated') errors.push('未校准的 V1 评分必须标记 provisional-unvalidated');
  if (policy.minimumCandidates < 2 || policy.maximumCandidates > 13 || policy.minimumCandidates > policy.maximumCandidates) errors.push('候选数量范围必须在 2-13 内');
  if (policy.minimumConfirmedEvents < 3) errors.push('最少确认事件不能少于 3 个');
  if (policy.recommendedConfirmedEvents < policy.minimumConfirmedEvents) errors.push('推荐事件数不能小于最低事件数');
  if (policy.minimumDistinctCategories < 2) errors.push('最少事件类别不能少于 2 类');
  if (policy.recommendedDistinctCategories < policy.minimumDistinctCategories) errors.push('推荐类别数不能小于最低类别数');
  validateUnitWeights('事件质量', Object.values(policy.eventQualityWeights), errors);
  validateUnitWeights('日期精度', Object.values(policy.datePrecisionWeights), errors);
  if (policy.eventQualityWeights.unconfirmed !== 0) errors.push('未确认事件权重必须为 0');
  if (policy.datePrecisionWeights.unknown !== 0) errors.push('日期不详事件权重必须为 0');
  if (policy.nonDiscriminatingEvidenceWeight !== 0) errors.push('无区分度证据权重必须为 0');
  if (policy.perEventAbsoluteCap <= 0) errors.push('单事件分数上限必须大于 0');
  if (policy.perCategoryShareCap <= 0 || policy.perCategoryShareCap > 0.5) errors.push('单类别贡献上限必须在 0-0.5 之间');
  if (policy.displayLabel !== '相对证据指数') errors.push('未校准分数只能显示为相对证据指数');
  if (policy.stableTopCandidateRate <= 0.5 || policy.stableTopCandidateRate > 1) errors.push('稳定候选比例必须大于 0.5 且不超过 1');
  if (!policy.principles.some(item => item.includes('不是出生时辰正确概率'))) errors.push('评分原则必须声明指数不是正确概率');
}

function validateTopics(methodology: RectificationMethodology, errors: string[]) {
  const seen = new Set<string>();
  for (const mapping of methodology.topicMappings) {
    if (!VALID_CATEGORIES.has(mapping.category)) errors.push(`未知事件分类：${mapping.category}`);
    if (seen.has(mapping.category)) errors.push(`事件分类映射重复：${mapping.category}`);
    seen.add(mapping.category);
    for (const palace of [...mapping.primaryPalaces, ...mapping.secondaryPalaces]) {
      if (!VALID_PALACES.has(palace)) errors.push(`事件分类 ${mapping.category} 使用未知宫位：${palace}`);
    }
    if (mapping.scoreable && !mapping.primaryPalaces.length) errors.push(`可评分事件分类 ${mapping.category} 必须有主宫位`);
    if (mapping.category === 'custom' && mapping.scoreable) errors.push('未映射的自定义事件不能参与评分');
  }
  for (const category of LIFE_EVENT_CATEGORIES) if (!seen.has(category)) errors.push(`缺少事件分类映射：${category}`);
}

function validateRules(methodology: RectificationMethodology, errors: string[]) {
  const sourceIds = new Set(methodology.sources.map(item => item.id));
  const ids = new Set<string>();
  for (const rule of methodology.rules) {
    if (ids.has(rule.id)) errors.push(`规则编号重复：${rule.id}`);
    ids.add(rule.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id)) errors.push(`规则编号不符合 kebab-case：${rule.id}`);
    if (!rule.requiredInputs.length) errors.push(`规则 ${rule.id} 缺少输入声明`);
    if (rule.priority < 1 || rule.priority > 100) errors.push(`规则 ${rule.id} 优先级必须在 1-100`);
    if (rule.baseWeight < 0 || rule.baseWeight > 1) errors.push(`规则 ${rule.id} 基础权重必须在 0-1`);
    if (rule.layer === 'safety' && rule.baseWeight !== 0) errors.push(`安全规则 ${rule.id} 不能贡献分数`);
    if (!rule.sourceIds.length) errors.push(`规则 ${rule.id} 缺少来源`);
    for (const sourceId of rule.sourceIds) if (!sourceIds.has(sourceId)) errors.push(`规则 ${rule.id} 引用未知来源：${sourceId}`);
    const copy = `${rule.name}\n${rule.description}`;
    for (const claim of methodology.prohibitedClaims) if (copy.includes(claim)) errors.push(`规则 ${rule.id} 使用禁用结论：${claim}`);
  }
  for (const required of ['insufficient-event-guard', 'indistinguishable-candidate-guard']) {
    if (!ids.has(required)) errors.push(`缺少安全规则：${required}`);
  }
}

function validateEvidencePolicy(methodology: RectificationMethodology, errors: string[]) {
  if (!methodology.allowedEvidence.length) errors.push('必须声明允许证据');
  if (!methodology.forbiddenEvidence.length) errors.push('必须声明禁用证据');
  if (!methodology.prohibitedClaims.length) errors.push('必须声明禁用结论');
  const allowed = new Set(methodology.allowedEvidence);
  for (const item of methodology.forbiddenEvidence) if (allowed.has(item)) errors.push(`证据不能同时允许和禁用：${item}`);
  for (const forbidden of ['发旋数量或位置', '出生姿势或婴儿睡姿', '仅凭性格描述匹配时辰', 'AI 直觉分、AI 自行补算命盘或修改规则分']) {
    if (!methodology.forbiddenEvidence.includes(forbidden)) errors.push(`V1 必须禁用：${forbidden}`);
  }
  const sourceIds = new Set<string>();
  for (const source of methodology.sources) {
    if (sourceIds.has(source.id)) errors.push(`来源编号重复：${source.id}`);
    sourceIds.add(source.id);
    if (!source.note.trim()) errors.push(`来源 ${source.id} 缺少使用说明`);
  }
}

function validateUnitWeights(label: string, values: number[], errors: string[]) {
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) errors.push(`${label}权重必须在 0-1`);
}
