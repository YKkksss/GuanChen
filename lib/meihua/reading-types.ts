import type { Element, Trigram } from './types';
export const LEGACY_MEIHUA_READING_VERSION = 'meihua-reading-v1-season-conditional-timing';
export const LEGACY_MEIHUA_IMAGERY_READING_VERSION = 'meihua-reading-v2-imagery-provenance';
export const MEIHUA_READING_VERSION = 'meihua-reading-v3-explicit-scenarios';
export const MEIHUA_SEASON_POLICIES = { jie_month: '按精确交节月参考', lunar_month: '按农历月参考' } as const;
export const MEIHUA_TIMING_TARGETS = { body: '本卦固定体', use: '本卦用', changed_use: '变卦用' } as const;
export type MeihuaSeasonState = '旺' | '相' | '休' | '囚' | '死';
export interface MeihuaReading {
  version: string;
  status: 'ready' | 'needs_time';
  context: null | { dateTime: string; source: 'cast' | 'context'; policy: keyof typeof MEIHUA_SEASON_POLICIES; label: string; monthBranch: string; monthElement: Element; lunarMonth: number; leapMonth: boolean; note: string };
  rows: Array<{ key: string; label: string; trigram: Trigram; relationship: string; state: MeihuaSeasonState | null }>;
  groups: Array<{ relationship: string; positions: string[]; note: string }>;
  timing: { target: keyof typeof MEIHUA_TIMING_TARGETS; label: string; trigram: Trigram; conditions: Array<{ label: string; branches: string[]; detail: string }>; number: number; note: string };
  boundaries: string[];
  /** 旧季节快照没有取象层，回看时不补算。 */
  imagery?: import('./imagery-types').MeihuaImagery;
  /** 旧卦例没有明确占类，不从占问补算角色。 */
  scenario?: import('./scenario-types').MeihuaScenario;
}
