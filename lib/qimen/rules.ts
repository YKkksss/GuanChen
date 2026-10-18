import type { Dun, Element } from './types';
export const QIMEN_SOURCES = { basic:'https://zh.wikisource.org/wiki/奇門遁甲統宗',ju:'https://zh.wikisource.org/wiki/奇門遁甲元靈經' };
export const STEMS=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
export const BRANCHES=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
export const INSTRUMENTS=['戊','己','庚','辛','壬','癸','丁','丙','乙'];
// 外八宫按南上北下图的顺时针环排列；地盘布仪和值使计时仍走九宫数序。
export const RING=[1,8,3,4,9,2,7,6];
export const GRID=[4,9,2,3,5,7,8,1,6];
export const PALACE_INFO:Record<number,{name:string;direction:string;element:Element;star:string;door:string|null}>={
  1:{name:'坎',direction:'正北',element:'水',star:'天蓬',door:'休门'},2:{name:'坤',direction:'西南',element:'土',star:'天芮',door:'死门'},
  3:{name:'震',direction:'正东',element:'木',star:'天冲',door:'伤门'},4:{name:'巽',direction:'东南',element:'木',star:'天辅',door:'杜门'},
  5:{name:'中',direction:'中央',element:'土',star:'天禽',door:null},6:{name:'乾',direction:'西北',element:'金',star:'天心',door:'开门'},
  7:{name:'兑',direction:'正西',element:'金',star:'天柱',door:'惊门'},8:{name:'艮',direction:'东北',element:'土',star:'天任',door:'生门'},
  9:{name:'离',direction:'正南',element:'火',star:'天英',door:'景门'},
};
export const GODS=['值符','螣蛇','太阴','六合','白虎','玄武','九地','九天'];
export const BRANCH_PALACES:Record<string,number>={子:1,丑:8,寅:8,卯:3,辰:4,巳:4,午:9,未:2,申:2,酉:7,戌:6,亥:6};
// 三元数字依次为上、中、下元；每个节气均有独立表项，不用月份近似节气。
export const TERM_JU:Record<string,{dun:Dun;numbers:[number,number,number]}>={
  冬至:{dun:'yang',numbers:[1,7,4]},小寒:{dun:'yang',numbers:[2,8,5]},大寒:{dun:'yang',numbers:[3,9,6]},
  立春:{dun:'yang',numbers:[8,5,2]},雨水:{dun:'yang',numbers:[9,6,3]},惊蛰:{dun:'yang',numbers:[1,7,4]},
  春分:{dun:'yang',numbers:[3,9,6]},清明:{dun:'yang',numbers:[4,1,7]},谷雨:{dun:'yang',numbers:[5,2,8]},
  立夏:{dun:'yang',numbers:[4,1,7]},小满:{dun:'yang',numbers:[5,2,8]},芒种:{dun:'yang',numbers:[6,3,9]},
  夏至:{dun:'yin',numbers:[9,3,6]},小暑:{dun:'yin',numbers:[8,2,5]},大暑:{dun:'yin',numbers:[7,1,4]},
  立秋:{dun:'yin',numbers:[2,5,8]},处暑:{dun:'yin',numbers:[1,4,7]},白露:{dun:'yin',numbers:[9,3,6]},
  秋分:{dun:'yin',numbers:[7,1,4]},寒露:{dun:'yin',numbers:[6,9,3]},霜降:{dun:'yin',numbers:[5,8,2]},
  立冬:{dun:'yin',numbers:[6,9,3]},小雪:{dun:'yin',numbers:[5,8,2]},大雪:{dun:'yin',numbers:[4,7,1]},
};
export const mod=(n:number,m:number)=>(n%m+m)%m;
export const host=(palace:number)=>palace===5?2:palace;
