import { BRANCHES, INSTRUMENTS, STEMS, host } from './rules';
import { QimenError } from './error';
import type { QimenFocusItem } from './reading-types';
import type { QimenResult } from './types';

export function resolveQimenStem(gz: string) {
  if (typeof gz !== 'string' || gz.length !== 2) throw new QimenError('日时干支不正确');
  const index = Array.from({ length: 60 }, (_, i) => i).find(i => STEMS[i % 10] === gz[0] && BRANCHES[i % 12] === gz[1]);
  if (index === undefined) throw new QimenError('日时干支不正确');
  const first = Math.floor(index / 10) * 10;
  return { stem: gz[0], matchedStem: gz[0] === '甲' ? INSTRUMENTS[first / 10] : gz[0], hiddenJia: gz[0] === '甲', xun: '甲' + BRANCHES[first % 12] };
}

export function stemItem(result: QimenResult, gz: string, key: string, label: string): QimenFocusItem {
  const resolved = resolveQimenStem(gz), earth = result.palaces.find(p => p.earthStem === resolved.matchedStem), palaces = result.palaces.filter(p => p.number !== 5 && p.heavenStems.includes(resolved.matchedStem)).map(p => p.number);
  return { key, label, symbol: resolved.stem, matchedSymbol: resolved.matchedStem, palaces, earthOrigin: earth?.number ?? null, earthHost: earth ? host(earth.number) : null, hiddenJia: resolved.hiddenJia,
    detail: `${label}${gz}，${resolved.hiddenJia ? `按该柱自身${resolved.xun}旬遁仪${resolved.matchedStem}定位，不借用另一柱旬首仪` : `以天干${resolved.stem}定位`}；地盘原${earth?.number ?? '未识别'}宫${earth?.number === 5 ? '，寄坤二宫' : ''}，天盘随星落${palaces.join('、') || '未识别'}宫。这里只定位符号，具体人事角色须按占问核对。` };
}

/** 固定奇仪符号没有所属日期，不伪造一个干支柱替它定位。 */
export function stemSymbolItem(result: QimenResult, stem: string, key: string, label: string): QimenFocusItem {
  if (!INSTRUMENTS.includes(stem)) throw new QimenError('需要明确的三奇六仪符号');
  const earth = result.palaces.find(p => p.earthStem === stem);
  const palaces = result.palaces.filter(p => p.number !== 5 && p.heavenStems.includes(stem)).map(p => p.number);
  return { key, label, symbol: stem, matchedSymbol: stem, palaces, earthOrigin: earth?.number ?? null, earthHost: earth ? host(earth.number) : null, hiddenJia: false,
    detail: `${label}以天盘${stem}定位；地盘原${earth?.number ?? '未识别'}宫${earth?.number === 5 ? '，寄坤二宫' : ''}，天盘随星落${palaces.join('、') || '未识别'}宫。固定奇仪符号不另造日期或借用时柱旬首。` };
}
