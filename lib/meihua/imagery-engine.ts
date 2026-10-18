import type { MeihuaEvidence, MeihuaResult, Trigram } from './types';
import type { MeihuaReading } from './reading-types';
import { MEIHUA_SYMBOL_CATALOG } from './imagery-catalog';
import { MEIHUA_IMAGERY_VERSION, MEIHUA_SYMBOL_CATALOG_VERSION, type MeihuaImagery, type MeihuaImageryNode, type MeihuaImageryNodeKey } from './imagery-types';

const SOURCE = 'https://zh.wikisource.org/wiki/梅花易數/卷一';
const BODY_LINES = { lower: [1, 2, 3], upper: [4, 5, 6] };
const valueLabel = (value: number) => value === 1 ? '阳' : '阴';

/** 从已计算的单动爻盘构造取象快照；只追溯来源，不重新起卦或选体。 */
export function buildMeihuaImagery(result: MeihuaResult, reading: MeihuaReading): MeihuaImagery {
  const mutualSource = result.input.mutualPolicy === 'pure_changed' && [1, 2].includes(result.primary.number) ? 'changed' : 'primary';
  const node = (key: MeihuaImageryNodeKey, label: string, trigram: Trigram, sourceBoard: 'primary' | 'changed', positions: number[]): MeihuaImageryNode => {
    const source = result[sourceBoard];
    const lineTrace = positions.map((originalPosition, index) => ({
      position: index + 1,
      originalPosition,
      originalValue: result.primary.lines[originalPosition - 1],
      value: source.lines[originalPosition - 1],
      flipped: result.primary.lines[originalPosition - 1] !== source.lines[originalPosition - 1],
    }));
    if (lineTrace.some((line, index) => line.value !== trigram.lines[index])) throw new Error('取象节点的卦画与来源爻不一致');
    const catalog = MEIHUA_SYMBOL_CATALOG[trigram.number];
    if (!catalog) throw new Error('八卦类象目录缺少当前卦');
    const savedRow = reading.rows.find(row => row.key === key);
    return {
      key, label, trigram: { ...trigram, lines: [...trigram.lines] }, sourceBoard,
      sourceLinePositions: [...positions], containsMovingOrigin: positions.includes(result.movingLine), changedApplied: lineTrace.some(line => line.flipped), lineTrace,
      symbolicCandidates: { ...catalog, nature: [...catalog.nature], objects: [...catalog.objects], forms: [...catalog.forms] },
      relationship: savedRow?.relationship ?? '未列当前关系', seasonState: savedRow?.state ?? null,
      evidenceId: `reading:imagery:node:${key}`,
    };
  };
  const nodes = [
    node('body', '本卦固定体', result.body.trigram, 'primary', BODY_LINES[result.body.position]),
    node('primary', '本卦用', result.use.trigram, 'primary', BODY_LINES[result.use.position]),
    node('mutual_lower', '下互', result.mutual.lower, mutualSource, [2, 3, 4]),
    node('mutual_upper', '上互', result.mutual.upper, mutualSource, [3, 4, 5]),
    node('changed', '变卦用与原体', result.changed[result.use.position], 'changed', BODY_LINES[result.use.position]),
  ];
  const overlaps: MeihuaImagery['overlaps'] = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex++) {
    const left = nodes[leftIndex], right = nodes[rightIndex];
    const originalLines = left.sourceLinePositions.filter(position => right.sourceLinePositions.includes(position));
    const differentValues = originalLines.filter(position => left.lineTrace.find(line => line.originalPosition === position)!.value !== right.lineTrace.find(line => line.originalPosition === position)!.value);
    overlaps.push({ left: left.key, right: right.key, originalLines, differentValues, sameTrigram: left.trigram.number === right.trigram.number, evidenceId: `reading:imagery:overlap:${left.key}:${right.key}` });
  }
  return {
    version: MEIHUA_IMAGERY_VERSION, catalogVersion: MEIHUA_SYMBOL_CATALOG_VERSION, mutualSource, nodes,
    change: { from: 'primary', to: 'changed', originalMovingLine: result.movingLine, localMovingLine: (result.movingLine - 1) % 3 + 1, before: result.primary.lines[result.movingLine - 1], after: result.changed.lines[result.movingLine - 1], fixedBodyKey: 'body', evidenceId: 'reading:imagery:change' },
    overlaps,
    sources: [
      { id: 'neutral-symbols', title: '《梅花易数》卷一·八卦万物属类（并为上卦）', url: SOURCE + '#八卦萬物屬類（並為上卦）', note: '只选自然、器物和形态的少量中性候选，使用简体及日常词解释，不扩成现实对象识别或占类结论。' },
      { id: 'mutual-origin', title: '《梅花易数》卷一·互卦起例', url: SOURCE + '#互卦起例', note: '本项目明确下互取234、上互取345；纯乾坤取变卦的异例仅在所选口径下使用。溯源是对既有计算的记录，不增设另一种互卦。' },
      { id: 'single-change', title: '《梅花易数》卷一·爻以六除', url: SOURCE + '#爻以六除', note: '沿用既有唯一动爻翻转结果，记录阴阳变化，不按爻数推算现实应验日。' },
      { id: 'fixed-body', title: '《梅花易数》卷二·体用总诀', url: 'https://zh.wikisource.org/wiki/梅花易數/卷二#體用總訣', note: '沿用本卦无动爻侧作固定体的项目口径；本、互、变位置与既有季节条件分别保留，不重新选变卦体。' },
    ],
    boundaries: [
      '类象是传统候选索引，不是已经识别的现实人物、物品、身体状况、隐私、外应或事件。不能从某个象目直接认定发生了什么。',
      '各位置即使卦名相同仍保留不同身份；上下互共享原始第3、4爻，变化前后同源，不按象目、重复卦或共享位置的数量投票。',
      '包含原动爻的位置不等于已经翻转：普通互卦读取本卦，纯乾坤取变卦口径才读取变卦；初爻、上爻均不进入234／345取线。',
      '无共同原始爻也不等于独立现实证据；本用、上下互与变用仍来自同一次起卦。',
      '沿用已保存的固定体、生克和季节状态；没有明确季节时刻时仍不定位季节，不补现在、纳甲六亲、占类角色或精确应期。',
      '本轮未实现按占类自动取用、后天端法、外应采集、完整作用效力或吉凶评分，目录未列的象目不表示不存在其他取象可能。',
    ],
  };
}

export function meihuaImageryEvidence(imagery: MeihuaImagery): MeihuaEvidence[] {
  const source = (id: string) => imagery.sources.find(item => item.id === id)!.url;
  const labels = new Map(imagery.nodes.map(node => [node.key, node.label]));
  return [
    { id: 'reading:imagery:policy', label: '取象候选与同源结构边界', detail: imagery.boundaries.join(''), sourceUrl: source('neutral-symbols') },
    ...imagery.nodes.map(node => ({
      id: node.evidenceId, label: `${node.label} · ${node.trigram.name}的取象与爻来源`,
      detail: `自然类象：${node.symbolicCandidates.nature.join('、') || '本目录未列'}；器物类象：${node.symbolicCandidates.objects.join('、') || '本目录未列'}；形态类象：${node.symbolicCandidates.forms.join('、') || '本目录未列'}。读取${node.sourceBoard === 'primary' ? '本卦' : '变卦'}原${node.sourceLinePositions.join('、')}爻，从下往上${node.lineTrace.map(line => `${valueLabel(line.value)}${line.flipped ? '（由原爻翻转）' : ''}`).join('、')}；${node.containsMovingOrigin ? '包含原动爻位置' : '未包含原动爻位置'}，${node.changedApplied ? '已读取翻转后的值' : '未读取翻转值'}。相对固定原体：${node.relationship}；季节${node.seasonState ?? '未定位'}。象目仅为候选，不是现实对象认定。`,
      sourceUrl: source('neutral-symbols'),
    })),
    { id: imagery.change.evidenceId, label: '本用到变用的单动爻变化', detail: `原第${imagery.change.originalMovingLine}爻，即用卦局部第${imagery.change.localMovingLine}爻，由${valueLabel(imagery.change.before)}转${valueLabel(imagery.change.after)}；体始终为本卦固定体，未重新取体。变化是结构步骤，不是现实发生先后或确定应期。`, sourceUrl: source('single-change') },
    ...imagery.overlaps.map(pair => ({ id: pair.evidenceId, label: `${labels.get(pair.left)}与${labels.get(pair.right)}的同源复核`, detail: `共同原始爻：${pair.originalLines.join('、') || '无'}；其中读取不同阴阳值的原爻：${pair.differentValues.join('、') || '无'}；${pair.sameTrigram ? '当前八卦相同，身份仍分开' : '当前八卦不同'}。它们都来自同一次起卦，不按重复卦或重合条目作为独立事实投票。`, sourceUrl: source('mutual-origin') })),
  ];
}
