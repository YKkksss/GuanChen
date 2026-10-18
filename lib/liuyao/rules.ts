import { hexagramFromLines } from '@/lib/meihua/engine';
import { TRIGRAMS } from '@/lib/meihua/trigrams';
import type { AssignedLine, Element, Hexagram, Kin, Line, Palace } from './types';
export const LIUYAO_SOURCES = {
  coins: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_466_(1700-1725).djvu/33',
  palace: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_466_(1700-1725).djvu/34',
  najia: 'https://zh.wikisource.org/wiki/易漢學_(四庫全書本)/卷4',
  spirits: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_466_(1700-1725).djvu/35',
  changed: 'https://zh.wikisource.org/wiki/增刪卜易/7',
  empty: 'https://zh.wikisource.org/wiki/增刪卜易/26',
  month: 'https://zh.wikisource.org/wiki/增刪卜易/16',
};
export const BRANCH_ELEMENTS: Record<string, Element> = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' };
const GENERATES: Record<Element, Element> = { 木:'火',火:'土',土:'金',金:'水',水:'木' };
const CONTROLS: Record<Element, Element> = { 木:'土',土:'水',水:'火',火:'金',金:'木' };
export function kinFor(palace: Element, line: Element): Kin {
  return palace===line?'兄弟':GENERATES[line]===palace?'父母':GENERATES[palace]===line?'子孙':CONTROLS[line]===palace?'官鬼':'妻财';
}
// 数组从初爻至上爻，内外乾坤的天干分别记录；各卦取实际上下三画卦纳甲。
const NAJIA: Record<number, { stems: [string,string]; branches: string[] }> = {
  1:{stems:['甲','壬'],branches:['子','寅','辰','午','申','戌']},
  2:{stems:['丁','丁'],branches:['巳','卯','丑','亥','酉','未']},
  3:{stems:['己','己'],branches:['卯','丑','亥','酉','未','巳']},
  4:{stems:['庚','庚'],branches:['子','寅','辰','午','申','戌']},
  5:{stems:['辛','辛'],branches:['丑','亥','酉','未','巳','卯']},
  6:{stems:['戊','戊'],branches:['寅','辰','午','申','戌','子']},
  7:{stems:['丙','丙'],branches:['辰','午','申','戌','子','寅']},
  8:{stems:['乙','癸'],branches:['未','巳','卯','丑','亥','酉']},
};
export function assignLines(hex: Hexagram, baseElement: Element): AssignedLine[] {
  return hex.lines.map((_,i)=>{const n=NAJIA[i<3?hex.lower.number:hex.upper.number],branch=n.branches[i],element=BRANCH_ELEMENTS[branch];return {position:i+1,stem:n.stems[i<3?0:1],branch,element,kin:kinFor(baseElement,element)};});
}
const STAGES = ['八纯','一世','二世','三世','四世','五世','游魂','归魂'];
const SHI = [6,1,2,3,4,5,4,3];
const PALACES = new Map<number, Palace>();
for (const trigram of TRIGRAMS) {
  const lines: Line[] = [...trigram.lines,...trigram.lines];
  for (let stage=0;stage<8;stage++) {
    if (stage>=1&&stage<=5) lines[stage-1]=lines[stage-1]===1?0:1;
    if (stage===6) lines[3]=lines[3]===1?0:1;
    if (stage===7) for(let i=0;i<3;i++)lines[i]=lines[i]===1?0:1;
    const number=hexagramFromLines(lines).number,shi=SHI[stage];
    if (PALACES.has(number)) throw new Error('八宫卦序重复');
    PALACES.set(number,{trigram:trigram.number,name:trigram.name,element:trigram.element,stage:STAGES[stage],shi,ying:(shi+2)%6+1});
  }
}
export function palaceFor(hex: Hexagram): Palace { const p=PALACES.get(hex.number);if(!p)throw new Error('卦宫不存在');return {...p}; }
export function sixSpirits(dayStem: string) {
  const start: Record<string,number> = {甲:0,乙:0,丙:1,丁:1,戊:2,己:3,庚:4,辛:4,壬:5,癸:5};
  if (!Object.hasOwn(start,dayStem)) throw new Error('日干不正确');
  const names=['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
  return Array.from({length:6},(_,i)=>names[(start[dayStem]+i)%6]);
}
