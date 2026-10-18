import type { ElectionTimeSelection } from './hours-types';
import type { PersonalElectionInput, PersonalElectionSnapshot, PersonalElectionAssessment } from './personal-types';
export const ELECTION_EVENTS = { marriage: { label: '婚嫁', term: '嫁娶' }, moving: { label: '搬家入宅', term: '入宅' }, opening: { label: '开业', term: '开市' }, travel: { label: '出行', term: '出行' }, renovation: { label: '修造装修', term: '修造' }, contract: { label: '签约立券', term: '立券' }, worship: { label: '祭祀', term: '祭祀' } } as const;
export type ElectionEvent = keyof typeof ELECTION_EVENTS;
export const ELECTION_MODES = { compare: '两种黄历口径共同筛选', day_boundary: '按交节日期口径', exact_boundary: '按精确交节时刻口径' } as const;
export type ElectionMode = keyof typeof ELECTION_MODES;
export const ELECTION_STATUSES = { candidate: '候选', review: '待核', avoid: '事项忌', unlisted: '未列明', excluded: '条件排除' } as const;
export type ElectionStatus = keyof typeof ELECTION_STATUSES;
export const ZODIACS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'] as const;
export const WEEKDAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'] as const;
export const ELECTION_VERSION = 'almanac-election-v2-lunar-1.7.7';
export const ELECTION_SOURCE = 'https://github.com/6tail/lunar-javascript/blob/v1.7.7/lunar.js';
export interface ElectionInput { event: ElectionEvent; startDate: string; endDate: string; ruleMode: ElectionMode; weekdays: number[]; excludedZodiacs: number[]; personal?: PersonalElectionInput }
export interface AlmanacRule { mode: 'day_boundary' | 'exact_boundary'; monthGanZhi: string; yi: string[]; ji: string[]; assessment: 'support' | 'avoid' | 'unlisted'; reason: string; selected: boolean }
export interface ElectionDay { date: string; weekday: number; lunar: string; lunarMonth: number; leapMonth: boolean; dayGanZhi: string; jieQi: string; zhiXing: string; tianShen: string; tianShenType: string; tianShenLuck: string; chong: string; chongZodiac: string; sha: string; boundary: { changesWithinDay: boolean; startMonth: string; noonMonth: string; endMonth: string }; rules: AlmanacRule[]; status: ElectionStatus; reasons: string[]; baseStatus?: ElectionStatus; personal?: PersonalElectionAssessment }
export interface ElectionResult { version: string; source: string; input: ElectionInput; representativeTime: string; timezone: string; warnings: string[]; counts: Record<ElectionStatus, number>; days: ElectionDay[]; personal?: PersonalElectionSnapshot }
export interface ElectionPlanSummary { id: string; title: string; input: ElectionInput; counts: Record<ElectionStatus,number>; selectedDates: string[]; notes: string; createdAt: number; updatedAt: number }
export interface ElectionPlan extends ElectionPlanSummary { result: ElectionResult; selectedTimes: ElectionTimeSelection[] }
