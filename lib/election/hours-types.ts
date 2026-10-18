import type { AlmanacRule, ElectionInput, ElectionStatus } from './types';
import type { PersonalElectionAssessment, PersonalElectionSnapshot } from './personal-types';

export const ELECTION_HOURS_VERSION = 'almanac-hours-v1-lunar-1.7.7';
export const ELECTION_HOURS_SOURCE = 'https://github.com/6tail/lunar-javascript/blob/v1.7.7/lunar.js';
export const ELECTION_HOURS_POLICY = '北京时间标准时；日宜忌按公历日，时宜忌按库的23点子初换日；晚子时口径差异保留待核。';
export interface ElectionHourSlot {
  id: string; startSecond: number; endSecond: number; start: string; end: string; label: string;
  timeGanZhi: string; civilDayGanZhi: string; timeRuleDayGanZhi: string;
  monthGanZhi: string; splitAtTerm: boolean; lateZi: boolean;
  yi: string[]; ji: string[]; timeAssessment: AlmanacRule['assessment'];
  dayRules: AlmanacRule[]; status: ElectionStatus; reasons: string[];
  baseStatus?: ElectionStatus; personal?: PersonalElectionAssessment; personalDay?: PersonalElectionAssessment;
  chong: string; chongZodiac: string; sha: string; tianShen: string; tianShenType: string; tianShenLuck: string;
}
export interface ElectionHours {
  version: string; source: string; policy: string; date: string; input: ElectionInput;
  transitionAt: string | null; slots: ElectionHourSlot[];
  personal?: PersonalElectionSnapshot;
}
export interface ElectionTimeChoice { date: string; slotId: string }
export interface ElectionTimeSelection extends ElectionTimeChoice {
  version: string; source: string; policy: string; slot: ElectionHourSlot;
}
