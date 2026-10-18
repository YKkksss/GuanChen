import { BAZI_ELEMENTS, type BaziElement } from '@/lib/bazi/types';
import { ElectionError } from './error';
import type { PersonalElectionInput } from './personal-types';

export const PERSONAL_ELECTION_SOURCE = 'https://zh.wikisource.org/zh-hans/三命通會/卷二';
export const PERSONAL_STEM_COMBINES = ['甲己','乙庚','丙辛','丁壬','戊癸'];
export const PERSONAL_BRANCH_CLASHES = ['子午','丑未','寅申','卯酉','辰戌','巳亥'];
export const PERSONAL_BRANCH_COMBINES = ['子丑','寅亥','卯戌','辰酉','巳申','午未'];
export const PERSONAL_THREE_HARMONIES = ['申子辰','亥卯未','寅午戌','巳酉丑'];
export const PERSONAL_STEM_ELEMENTS: Record<string, BaziElement> = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' };
const keys = ['participants','avoidDayYearClash','avoidDayBranchClash','avoidHourYearClash','avoidHourBranchClash','filterStems','includeLuckContext'];
function elements(raw: unknown): BaziElement[] {
  if (!Array.isArray(raw) || raw.length > 5 || raw.some(v => !BAZI_ELEMENTS.includes(v as BaziElement))) throw new ElectionError('人工五行条件不正确');
  return BAZI_ELEMENTS.filter(v => raw.includes(v));
}
export function normalizePersonalElectionInput(raw: unknown): PersonalElectionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ElectionError('个人择日条件格式不正确');
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(k => !keys.includes(k))) throw new ElectionError('个人条件只接受八字版本标识与筛选规则，不接受客户端盘面或快照');
  if (!Array.isArray(v.participants) || v.participants.length < 1 || v.participants.length > 2) throw new ElectionError('请选择一至两位参与者的已保存八字');
  const participants = v.participants.map(rawPerson => {
    if (!rawPerson || typeof rawPerson !== 'object' || Array.isArray(rawPerson)) throw new ElectionError('参与者格式不正确');
    const p = rawPerson as Record<string, unknown>;
    if (Object.keys(p).some(k => !['chartId','preferredElements','cautiousElements','basisNote'].includes(k))) throw new ElectionError('参与者只接受八字版本标识与人工五行条件');
    if (typeof p.chartId !== 'string' || !p.chartId.trim() || p.chartId.length > 100) throw new ElectionError('请选择有效的八字版本');
    const preferredElements = elements(p.preferredElements === undefined ? [] : p.preferredElements), cautiousElements = elements(p.cautiousElements === undefined ? [] : p.cautiousElements);
    if (preferredElements.some(e => cautiousElements.includes(e))) throw new ElectionError('同一五行不能同时设为偏好和谨慎');
    if (p.basisNote !== undefined && typeof p.basisNote !== 'string') throw new ElectionError('人工条件依据需为文本');
    const basisNote = ((p.basisNote ?? '') as string).trim();
    if (basisNote.length > 200 || ((preferredElements.length || cautiousElements.length) && !basisNote)) throw new ElectionError('填写人工五行后，请提供1–200字依据说明');
    return { chartId:p.chartId.trim(), preferredElements, cautiousElements, basisNote };
  }).sort((a,b) => a.chartId.localeCompare(b.chartId));
  if (new Set(participants.map(p => p.chartId)).size !== participants.length) throw new ElectionError('不能重复选择同一八字版本');
  const flags = Object.fromEntries(keys.slice(1).filter(key => key !== 'includeLuckContext').map(key => {
    if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new ElectionError('个人筛选开关需为布尔值');
    return [key,v[key] ?? false];
  })) as Omit<PersonalElectionInput,'participants'>;
  if (flags.filterStems && !participants.some(p => p.preferredElements.length || p.cautiousElements.length)) throw new ElectionError('启用日干、时干过滤前，请填写至少一位参与者的人工五行条件');
  if (v.includeLuckContext !== undefined && typeof v.includeLuckContext !== 'boolean') throw new ElectionError('岁运背景开关需为布尔值');
  return { participants,...flags,...(v.includeLuckContext === true ? {includeLuckContext:true} : {}) };
}
