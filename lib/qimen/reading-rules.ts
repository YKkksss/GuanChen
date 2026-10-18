import type { Element } from './types';
export const QIMEN_READING_SOURCE='https://zh.wikisource.org/wiki/奇門遁甲統宗';
export const QIMEN_FOCUS_SOURCE='https://zh.wikisource.org/wiki/奇門遁甲元靈經';
export const GENERATES:Record<Element,Element>={木:'火',火:'土',土:'金',金:'水',水:'木'};
export const CONTROLS:Record<Element,Element>={木:'土',土:'水',水:'火',火:'金',金:'木'};
export const STAR_ELEMENTS:Record<string,Element>={天蓬:'水',天芮:'土',天冲:'木',天辅:'木',天禽:'土',天心:'金',天柱:'金',天任:'土',天英:'火'};
export const DOOR_ELEMENTS:Record<string,Element>={休门:'水',生门:'土',伤门:'木',杜门:'木',景门:'火',死门:'土',惊门:'金',开门:'金'};
export const INSTRUMENT_PUNISHMENTS:Record<string,number>={戊:3,己:2,庚:8,辛:9,壬:4,癸:4};
// 固定采用卷一四十格表。丁墓艮与同书歌诀乾宫异文另行提示，不混成唯一通则。
export const WONDER_TOMBS:Record<string,number>={乙:2,丙:6,丁:8};
export const STEM_PATTERNS:Record<string,string>={乙辛:'龙逃走',辛乙:'虎猖狂',癸丁:'蛇夭矫',丁癸:'雀投江'};
export const OPPOSITE_PALACES:Record<number,number>={1:9,9:1,2:8,8:2,3:7,7:3,4:6,6:4};
export const CLASH_PAIRS=['子午','丑未','寅申','卯酉','辰戌','巳亥'];
export const STEM_COMBINES=['甲己','乙庚','丙辛','丁壬','戊癸'];
