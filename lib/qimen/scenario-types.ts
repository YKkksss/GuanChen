import type { QimenElementRelation, QimenFocusItem, QimenPattern } from './reading-types';
import type { Element } from './types';

export const QIMEN_SCENARIO_VERSION = 'qimen-scenario-v1-wealth-exam-routes';
export const QIMEN_SCENARIOS = {
  none: '暂不指定占类',
  wealth: '求财 · 生门宫星体用',
  study: '考试 · 日干天辅文章',
  travel: '出行 · 水陆条件对照',
} as const;
export type QimenScenarioKey = keyof typeof QIMEN_SCENARIOS;

export interface QimenScenarioLocation {
  id: string;
  palace: number;
  symbol: string;
  comparisonElement: Element;
  comparisonBasis: 'palace' | 'star';
  detail: string;
  /** 仅属于该天盘干的刑墓；其他同宫格局仍由宫位条件单列。 */
  ownPatterns: QimenPattern[];
}

export interface QimenScenarioRole {
  id: string;
  label: string;
  symbol: string;
  locations: QimenScenarioLocation[];
  detail: string;
  stemFocus: QimenFocusItem | null;
}

export interface QimenScenarioComparison {
  id: string;
  fromRole: string;
  fromLocation: string;
  toRole: string;
  toLocation: string;
  relation: QimenElementRelation;
  samePalace: boolean;
  label: string;
  detail: string;
}

export interface QimenScenarioReview {
  version: string;
  key: QimenScenarioKey;
  label: string;
  status: 'unselected' | 'located' | 'partial';
  scope: string;
  roles: QimenScenarioRole[];
  comparisons: QimenScenarioComparison[];
  palaceNumbers: number[];
  pending: string[];
  sources: Array<{ id: string; label: string; url: string; detail: string }>;
  boundaries: string[];
}
