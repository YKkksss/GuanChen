import { stemItem, stemSymbolItem } from './focus-engine';
import { CONTROLS, GENERATES, QIMEN_FOCUS_SOURCE, QIMEN_READING_SOURCE } from './reading-rules';
import type { QimenElementRelation, QimenFocusItem, QimenReading } from './reading-types';
import { QIMEN_SCENARIOS, QIMEN_SCENARIO_VERSION, type QimenScenarioComparison, type QimenScenarioLocation, type QimenScenarioReview, type QimenScenarioRole } from './scenario-types';
import type { Element, QimenResult } from './types';
import { QimenError } from './error';

function relationFor(a: Element, b: Element): QimenElementRelation {
  return a === b ? 'same' : GENERATES[a] === b ? 'generates' : GENERATES[b] === a ? 'generated_by' : CONTROLS[a] === b ? 'controls' : 'controlled_by';
}

/** 场景只连接该占类的明确角色，不修改原九宫、参考对象或月令规则。 */
export function analyzeQimenScenario(result: QimenResult, reading: QimenReading): QimenScenarioReview {
  const key = result.input.scenario ?? 'none';
  if (!Object.hasOwn(QIMEN_SCENARIOS, key)) throw new QimenError('占类场景不正确');
  const roles: QimenScenarioRole[] = [];
  const comparisons: QimenScenarioComparison[] = [];
  const pending: string[] = [];
  const location = (palace: number, symbol: string, id: string, stem?: string): QimenScenarioLocation | null => {
    const p = reading.palaces.find(item => item.number === palace);
    if (!p || p.center) return null;
    return { id, palace, symbol, comparisonElement: p.element, comparisonBasis: 'palace', detail: `比较${symbol}实际落宫的${p.element}五行，不替换成符号自身五行。`,
      ownPatterns: stem ? p.patterns.filter(pattern => pattern.id === `punishment:${stem}` || pattern.id === `tomb:${stem}`) : [] };
  };
  const addPalaceRole = (id: string, label: string, symbol: string, numbers: number[], detail: string, focus: QimenFocusItem | null = null) => {
    const locations = numbers.flatMap(number => { const item = location(number, symbol, `${id}-${number}`, focus?.matchedSymbol); return item ? [item] : []; });
    const role: QimenScenarioRole = { id, label, symbol, locations, detail, stemFocus: focus };
    roles.push(role);
    return role;
  };
  const addDoor = (id: string, label: string, door: string, detail: string) => addPalaceRole(id, label, door, result.palaces.filter(p => p.number !== 5 && p.door === door).map(p => p.number), detail);
  const compare = (from: QimenScenarioRole, to: QimenScenarioRole, detail: string) => {
    for (const a of from.locations) for (const b of to.locations) {
      const relation = relationFor(a.comparisonElement, b.comparisonElement);
      const left = `${from.label}${a.comparisonBasis === 'star' ? `（${a.symbol}星五行）` : '（落宫五行）'}`;
      const right = `${to.label}${b.comparisonBasis === 'star' ? `（${b.symbol}星五行）` : '（宫五行）'}`;
      const label = { same: `${left}与${right}同五行`, generates: `${left}生${right}`, generated_by: `${right}生${left}`, controls: `${left}克${right}`, controlled_by: `${right}克${left}` }[relation];
      comparisons.push({ id: `${a.id}-to-${b.id}`, fromRole: from.id, fromLocation: a.id, toRole: to.id, toLocation: b.id, relation, samePalace: a.palace === b.palace, label,
        detail: `${detail}两角色${a.palace === b.palace ? '同宫仍分别保留，不能把同宫当作事情已成' : '分宫，分别核对两侧条件'}；关系不是有效性、成绩、收益或路线安全结论。` });
    }
  };

  if (key === 'wealth') {
    const body = addDoor('wealth_body', '体 · 生门落宫', '生门', '限本书求财宫星体用法：生门实际落宫为体。不是所有求财流派的统一取用，也不直接给出财运结果。');
    const stars = body.locations.flatMap(item => {
      const p = reading.palaces.find(palace => palace.number === item.palace)!;
      return p.stars.map(star => ({ id: `wealth_use-${p.number}-${star.name}`, palace: p.number, symbol: star.name, comparisonElement: star.element, comparisonBasis: 'star' as const,
        ownPatterns: [], detail: `${star.name}自身属${star.element}，本项以星五行为用；九星月令采用专门口诀，不能套宫门普通月令。` }));
    });
    const use: QimenScenarioRole = { id: 'wealth_use', label: '用 · 同宫实际九星', symbol: '生门宫天盘九星', locations: stars, stemFocus: null,
      detail: '以生门宫实际所乘九星为用；天禽随芮时两星逐项保留，不擅自选一，也不把同宫两项当作独立证据投票。' };
    roles.push(use);
    compare(use, body, '本场景比较星自身五行与生门所在宫五行，不是两个宫的生克。');
    pending.push('仅接入求财的宫星体用分支；原典另列时干地盘、甲子戊和内外等分支，未将其混成一套自动断法。', '体用关系与宫门月令、星专门月令、门迫及本宫格局须并列；不据此输出收益、到款日或投资指令。');
  } else if (key === 'study') {
    const dayFocus = stemItem(result, result.calendar.day, 'exam_day', '考试日干');
    const day = addPalaceRole('exam_day', '士子 · 日干', dayFocus.symbol, dayFocus.palaces, '仅限本场景以日干作士子参考；不是从占问猜测考生身份，也不把此角色推广到其他占类。', dayFocus);
    const examiner = addPalaceRole('exam_examiner', '文宗 · 天辅', '天辅', result.palaces.filter(p => p.number !== 5 && p.stars.includes('天辅')).map(p => p.number), '本书岁考条文以天辅作文宗参考，本版不据此推断真实教师或阅卷人的身份与意图。');
    const articleFocus = stemSymbolItem(result, '丁', 'exam_article', '文章');
    const article = addPalaceRole('exam_article', '文章 · 丁奇', '丁', articleFocus.palaces, '文章定位天盘丁；只比较保存的符号及落宫，不给出考试等第或录取预测。', articleFocus);
    compare(examiner, day, '比较天辅所在宫与日干所在宫的五行，不将天辅星木直接与日干自身五行相比较。');
    compare(article, day, '比较丁奇所在宫与日干所在宫的五行，丁奇自身火与日干自身五行不是本条比较口径。');
    pending.push('士子、文宗、文章为该窄占类的传统角色；本轮不移植古代等第，不预测分数、录取或他人意图。', '日干甲按日柱自身旬遁仪；即使与丁或天辅同宫，各角色仍独立保留，不以同宫或相生宣布成事。');
  } else if (key === 'travel') {
    const chief = addPalaceRole('travel_chief', '值使门', result.chief.door, [result.chief.doorPalace], `使用实际值使${result.chief.door}落宫；原计数到${result.chief.doorRawPalace}宫${result.chief.doorRawPalace === 5 ? '后寄坤二，不给中五另造活动门' : '，不改变值使排布'}。`);
    const water = addPalaceRole('travel_water', '水路参考 · 坎一', '坎一水路', [1], '占水陆条文的固定坎一参照；不是实地地图、水情或出行安全资料。');
    const land = addPalaceRole('travel_land', '陆路参考 · 艮八', '艮八陆路', [8], '占水陆条文的固定艮八参照；不是实地路线、交通状况或行动方向建议。');
    compare(chief, water, '比较值使门所落宫与固定坎一宫的五行。');
    compare(chief, land, '比较值使门所落宫与固定艮八宫的五行。');
    addDoor('travel_rest', '辅助 · 休门', '休门', '作为原典水陆条文所列辅助门位保留，不因门名给出可出行或安全保证。');
    addDoor('travel_life', '辅助 · 生门', '生门', '作为辅助门位保留；与值使或水陆参考同宫仍是不同角色，不按符号数量投票。');
    pending.push('只做占水陆的值使及坎艮条件对照，不等同一般出行、行人归期、同伴或店主的取用。', '本版不因生克、吉门名或宫位方位选择实际水陆路线、保证安全或计算出发归来日期。');
  }
  const palaceNumbers = [...new Set(roles.flatMap(role => role.locations.map(item => item.palace)))].sort((a, b) => a - b);
  const sources = key === 'none' ? [] : [
    { id: 'scenario', label: key === 'wealth' ? '卷十六 · 占求财宫星体用' : key === 'study' ? '卷八 · 岁考与考试文章取用' : '卷十四 · 占水陆', url: QIMEN_FOCUS_SOURCE,
      detail: key === 'wealth' ? '生门落宫为体，同宫天盘星为用；本版仅连接该分支，不继承原典断语。' : key === 'study' ? '按所选窄场景保留日干、天辅和丁的角色；不将古代等第或个案结果自动化。' : '固定坎一、艮八和值使落宫对照，休生门另列辅助；不转换成现实路线建议。' },
    { id: 'conditions', label: '宫门星仪既有条件口径', url: QIMEN_READING_SOURCE, detail: '复用已保存的两套月令、门宫关系、各干加临、刑墓位置及异文，不新增完整效力裁决。' },
  ];
  return {
    version: QIMEN_SCENARIO_VERSION, key, label: QIMEN_SCENARIOS[key], status: key === 'none' ? 'unselected' : roles.every(role => role.locations.length > 0) ? 'located' : 'partial',
    scope: '按明确占类连接取用角色、实际位置及两侧条件；不从问题文本猜占类，不作最终吉凶、等级、收益或安全判断。',
    roles, comparisons, palaceNumbers, pending, sources,
    boundaries: [
      '占类与原参考对象是两项独立设置；场景不会改变局数、原九宫或参考对象。',
      '求财体用比较星自身五行与宫五行；考试、水陆条目比较落宫五行，两种层级不能混同。',
      '宫内格局必须保留实际天盘干；其他干的击刑、入墓不能转给日干、门、星或整宫。自身刑墓仅按匹配奇仪单列，异文仍保留。',
      '部分宫支时旬空不等于全部宫内对象失效；月令、门迫、刑墓及伏反吟不靠相生或同宫自动解除。',
      '本版不合并角色、不评分、不自动裁决成败；全部占类、完整十干克应、长生、暗干及精确应期仍待分别核对。',
    ],
  };
}

export function scenarioEvidence(scenario: QimenScenarioReview, reading: QimenReading): QimenResult['evidence'] {
  const source = scenario.sources[0]?.url ?? QIMEN_FOCUS_SOURCE;
  const roleName = (id: string) => scenario.roles.find(role => role.id === id)!.label;
  return [
    { id: 'reading:scenario:policy', label: '占类取用与比较口径', detail: `${scenario.version}；${scenario.label}。${scenario.scope}${scenario.pending.join(' ')}${scenario.boundaries.join(' ')}`, sourceUrl: source },
    ...scenario.roles.map(role => ({ id: `reading:scenario:role:${role.id}`, label: `${role.label}的定位与条件`,
      detail: `${role.detail}${role.stemFocus?.detail ?? ''}${role.locations.map(item => `${item.symbol}落${item.palace}宫，比较${item.comparisonBasis === 'star' ? '星自身' : '宫'}${item.comparisonElement}；${role.stemFocus ? `该奇仪自身刑墓：${item.ownPatterns.map(pattern => `${pattern.label}${pattern.disputed ? '（有异文）' : ''}`).join('、') || '未列出，不能据此排除其他制约'}` : '门、星和固定宫参考不承接其他干的刑墓'}。${item.detail}`).join(' ') || '未定位，不补造宫位。'}`, sourceUrl: source })),
    ...scenario.comparisons.map(pair => ({ id: `reading:scenario:pair:${pair.id}`, label: `${roleName(pair.fromRole)}与${roleName(pair.toRole)}条件对照`, detail: `${pair.label}。${pair.detail}`, sourceUrl: source })),
    ...scenario.palaceNumbers.map(number => {
      const palace = reading.palaces.find(item => item.number === number)!;
      return { id: `reading:scenario:palace:${number}`, label: `${number}宫场景上下文`, detail: `${palace.element}宫普通月令${palace.monthState}；${palace.door ? `${palace.door.name}普通月令${palace.door.monthState}，${palace.door.label}` : '无活动门'}；${palace.stars.map(star => `${star.name}专门星令${star.monthState}`).join('、')}。宫内时旬空支${palace.emptyBranches.join('、') || '未列'}，不视为全宫对象已空。宫内格局：${palace.patterns.map(pattern => `${pattern.label}：${pattern.detail}`).join(' ') || '当前未列不等于无制约'}。这里是宫内上下文，不能把某一干的刑墓转移给同宫其他角色。`, sourceUrl: QIMEN_READING_SOURCE };
    }),
  ];
}
