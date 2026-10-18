import type { MeihuaEvidence, MeihuaResult } from './types';
import type { MeihuaReading } from './reading-types';
import { MEIHUA_SCENARIOS, MEIHUA_SCENARIO_VERSION, type MeihuaRelationship, type MeihuaScenario, type MeihuaScenarioKey } from './scenario-types';

const SOURCE = 'https://zh.wikisource.org/wiki/梅花易數/卷二';
type SelectedKey = Exclude<MeihuaScenarioKey, 'none'>;
const CONFIG: Record<SelectedKey, { object: string; anchor: string; checks: string[]; conditions: Record<MeihuaRelationship, [string, string]> }> = {
  planning: {
    object: '所谋事项', anchor: '求謀占第八',
    checks: ['请补充事项目标、主方能控制的资源与推进条件。', '核对所需投入、相关方配合及现实时间限制；卦象不替代进度或可行性评估。'],
    conditions: {
      体克用: ['主方制约事项，兼看推进迟缓', '本用被固定体所克。求谋条目在这一方向还强调迟缓，须区分控制事项的条件与实际推进速度。'],
      用克体: ['事项对主方形成制约', '本用克固定体。求谋条目把这一方向作为事项反过来约束主方的入口，应核对阻力与承受条件。'],
      用生体: ['事项对主方的生扶入口', '本用生固定体。求谋条目侧重事项对主方的支持条件，仍须核对支持是否存在、能否落实。'],
      体生用: ['主方向事项投入与耗泄', '固定体生本用。求谋条目关注主方付出与事情兑现之间的差距，应区分投入与已完成成果。'],
      比和: ['主方与事项的同类协调', '固定体与本用同五行。求谋条目侧重协调条件，同类关系本身不证明资源齐备或目标达成。'],
    },
  },
  wealth: {
    object: '所问财物', anchor: '求財占第十',
    checks: ['请说明所问财物、收支或交易背景，区分预期收益与已发生事实。', '成本、合同、履约及资金风险须另核；此处不提供投资品种、金额、买卖时点或收益保证。'],
    conditions: {
      体克用: ['主方制财的传统入口', '固定体克作为财的本用。求财条目将其用于观察主方与财物的制约关系；这不是已取得财物或可获利的证据。'],
      用克体: ['财事反向制约主方', '作为财的本用克固定体。应把财事带来的约束与主方承受条件分开核对，不能据此断言现实无财。'],
      用生体: ['财事生扶主方的入口', '作为财的本用生固定体。求财条目关注财事对主方的支持，须与实际到账、履约及收益情况分别核对。'],
      体生用: ['主方向财事投入与耗泄', '固定体生作为财的本用。求财条目关注付出和耗泄，不能把传统方向直接认定为已经亏损。'],
      比和: ['主方与财事的同类协调', '固定体与作为财的本用同五行。求财条目以协调关系取意，不表示真实回报、金额或兑现日期。'],
    },
  },
  travel: {
    object: '所行之应', anchor: '出行占第十二',
    checks: ['请补充出行目的、行程限制与现实准备；出行占不等同行人占。', '交通、天气、健康及目的地要求须从现实资料核对；卦象不判路线安全、事故或是否应出行。'],
    conditions: {
      体克用: ['主方制约所行之应', '固定体克作为所行之应的本用。出行条目关注主方对行程应事的制约条件，不等同路线安全或行程顺遂。'],
      用克体: ['行程应事制约主方', '作为所行之应的本用克固定体。出行条目关注行程条件反向约束主方，不能据此预测事故或危险。'],
      用生体: ['行程应事生扶主方', '作为所行之应的本用生固定体。出行条目关注行程条件对主方的支持，现实准备和限制仍需另核。'],
      体生用: ['主方向行程付出与耗泄', '固定体生作为所行之应的本用。出行条目关注主方为行程付出的条件，不能直接认定损失或不宜出行。'],
      比和: ['主方与行程应事同类协调', '固定体与作为所行之应的本用同五行。出行条目侧重协调条件，不能替代现实的交通与安全评估。'],
    },
  },
};
const SHARED: Record<MeihuaRelationship, [string, string]> = {
  体克用: ['固定体制约辅助用位', '固定体克此位置，只保留通用体用关系；不把本用的占类条文机械套给互卦或变用。'],
  用克体: ['辅助用位制约固定体', '此位置克固定体，作为与本用并列的制约条件；不能据此覆盖本用或认定现实阻碍。'],
  用生体: ['辅助用位生扶固定体', '此位置生固定体，保留生扶方向；不能因出现次数多就判支持占优。'],
  体生用: ['固定体生辅助用位', '固定体生此位置，保留输出与耗泄方向；不推定真实付出、损失或具体发生阶段。'],
  比和: ['辅助用位与固定体同类', '此位置与固定体同五行，保留同类关系；同名卦和共享爻不能作为多份独立支持。'],
};

/** 只在新计算时建立占类快照；回看旧记录不调用。 */
export function buildMeihuaScenario(result: MeihuaResult, reading: MeihuaReading): MeihuaScenario {
  const key = result.input.scenario ?? 'none';
  const boundaries = [
    '占类由用户明确选择；占问、聊天与类象候选都不能代替选择，也不识别现实对象。',
    '体始终是本卦不含动爻的一侧；本用承载明确占类角色，互变只作辅助用位，不重新换体。',
    '本用采用所选占类条目；上下互与变用只采用通用体用关系，不自动指定人物、财物或行程阶段。',
    '结构生克、两侧季节旺衰及现实条件分开保留；没有完整效力裁决、吉凶分数或成败结论。',
    '本互变同源、共享爻或同名卦不计票；相反关系并列，不投票抵消，也不硬判过程或结局。',
    '不生成得财日期、投资指令、出行安全判断、事故预测或确定应验时间；原条件应期层保持不变。',
  ];
  const commonSource = { id: 'shared-body-use', title: '《梅花易数》卷二·体用与体用总诀', url: SOURCE + '#體用總訣', note: '用于固定体、辅助用位与生克关系；本项目不按党多计票，不把中间末后硬映现实阶段。' };
  const scenario: MeihuaScenario = {
    version: MEIHUA_SCENARIO_VERSION, key, label: MEIHUA_SCENARIOS[key], status: key === 'none' ? 'unspecified' : 'selected',
    roles: [], primaryCondition: null, supplements: [], checks: [], sources: [commonSource], boundaries,
  };
  if (key === 'none') {
    scenario.checks = ['尚未明确选择求谋、求财或出行，不从自由占问推定角色；已有起卦、季节及取象仍可查看。'];
    return scenario;
  }
  const config = CONFIG[key], nodes = reading.imagery?.nodes;
  if (!nodes || nodes.length !== 5) throw new Error('占类复核需要完整的五位置取象来源');
  const bodyNode = nodes.find(node => node.key === 'body')!;
  scenario.sources.unshift({ id: `scenario-${key}`, title: `《梅花易数》卷二·${MEIHUA_SCENARIOS[key]}占`, url: SOURCE + '#' + config.anchor, note: '仅供本用占类角色和五种关系的传统侧重点核对；中性说明不作现实结果宣判。' });
  scenario.checks = [...config.checks];
  scenario.roles = nodes.map(node => ({
    nodeKey: node.key, label: node.label, role: node.key === 'body' ? '主方（固定体）' : node.key === 'primary' ? config.object : '辅助用位（不另指派现实对象）',
    trigram: node.trigram, sourceBoard: node.sourceBoard, sourceLinePositions: [...node.sourceLinePositions], seasonState: node.seasonState,
    imageryEvidenceId: node.evidenceId, evidenceId: `reading:scenario:role:${node.key}`,
  }));
  const conditions = nodes.filter(node => node.key !== 'body').map(node => {
    const relationship = node.relationship as MeihuaRelationship;
    const primary = node.key === 'primary';
    const [focus, observation] = (primary ? config.conditions : SHARED)[relationship];
    return {
      nodeKey: node.key as Exclude<typeof node.key, 'body'>, label: node.label, body: result.body.trigram, counterpart: node.trigram,
      relationship, ruleScope: primary ? 'selected_scenario_primary' as const : 'shared_body_use_reference' as const,
      focus, observation,
      pending: ['季节标签只按保存的明确时刻与月界参考，不改写生克方向，也不单独裁定关系效力。', primary ? config.checks[0] : '须连同本用及其他位置逐项看；与本用相反的方向同样保留，同源位置不能计票互证。'],
      bodySeasonState: bodyNode.seasonState, seasonState: node.seasonState,
      sourceId: primary ? `scenario-${key}` : 'shared-body-use', imageryEvidenceId: node.evidenceId, evidenceId: `reading:scenario:condition:${node.key}`,
    };
  });
  scenario.primaryCondition = conditions.find(condition => condition.nodeKey === 'primary')!;
  scenario.supplements = conditions.filter(condition => condition.nodeKey !== 'primary');
  return scenario;
}

export function meihuaScenarioEvidence(scenario: MeihuaScenario): MeihuaEvidence[] {
  const source = (id: string) => scenario.sources.find(item => item.id === id)?.url ?? SOURCE;
  return [
    { id: 'reading:scenario:policy', label: '明确占类与取用口径', detail: `${scenario.label}，${scenario.status === 'selected' ? '用户明确选择' : '未建立占类角色'}。${scenario.boundaries.join(' ')}${scenario.checks.join(' ')}`, sourceUrl: source(scenario.key === 'none' ? 'shared-body-use' : `scenario-${scenario.key}`) },
    ...scenario.roles.map(role => ({ id: role.evidenceId, label: `${scenario.label}·${role.label}角色`, detail: `${role.role}：${role.trigram.name}${role.trigram.element}；${role.sourceBoard === 'primary' ? '本卦' : '变卦'}原第${role.sourceLinePositions.join('、')}爻；季节${role.seasonState ?? '未定位'}。来源取象依据${role.imageryEvidenceId}。`, sourceUrl: source(role.nodeKey === 'body' || role.nodeKey === 'primary' ? `scenario-${scenario.key}` : 'shared-body-use') })),
    ...[...(scenario.primaryCondition ? [scenario.primaryCondition] : []), ...scenario.supplements].map(condition => ({ id: condition.evidenceId, label: `${scenario.label}·${condition.label}条件`, detail: `固定体${condition.body.name}${condition.body.element}（${condition.bodySeasonState ?? '季节未定位'}）与${condition.counterpart.name}${condition.counterpart.element}（${condition.seasonState ?? '季节未定位'}）：${condition.relationship}。${condition.focus}。${condition.observation}${condition.pending.join(' ')}`, sourceUrl: source(condition.sourceId) })),
  ];
}
