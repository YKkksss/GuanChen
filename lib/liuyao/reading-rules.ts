import type { Element } from './types';
export const READING_SOURCES = {
  focus:'https://zh.wikisource.org/wiki/增刪卜易/8',
  roles:'https://zh.wikisource.org/wiki/增刪卜易/9',
  effectiveness:'https://zh.wikisource.org/wiki/增刪卜易/10',
  month:'https://zh.wikisource.org/wiki/增刪卜易/15又',
  monthBreak:'https://zh.wikisource.org/wiki/增刪卜易/16',
  day:'https://zh.wikisource.org/wiki/增刪卜易/17',
  activation:'https://zh.wikisource.org/wiki/增刪卜易/22',
  change:'https://zh.wikisource.org/wiki/增刪卜易/15',
  progression:'https://zh.wikisource.org/wiki/增刪卜易#進神退神章第二十九',
  empty:'https://zh.wikisource.org/wiki/增刪卜易/26',
  multiple:'https://zh.wikisource.org/wiki/增刪卜易#兩現章第三十二',
};
export const GENERATES: Record<Element,Element> = {木:'火',火:'土',土:'金',金:'水',水:'木'};
export const CONTROLS: Record<Element,Element> = {木:'土',土:'水',水:'火',火:'金',金:'木'};
export const CLASH_PAIRS = ['子午','丑未','寅申','卯酉','辰戌','巳亥'];
export const COMBINE_PAIRS = ['子丑','寅亥','卯戌','辰酉','巳申','午未'];
// 原典列七组顺进；戌→丑不在本表，不能按土支循环机械补入。
export const ADVANCE_PAIRS = ['亥子','寅卯','巳午','申酉','丑辰','辰未','未戌'];
