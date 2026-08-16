import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import type {
  ChartOwner,
  HemingRuleResult,
  RelationshipType,
} from './types';

export interface HemingAnnualPalaceActivation {
  palace: string;
  branch: number;
  reasons: string[];
}

export interface HemingAnnualOwnerView {
  owner: ChartOwner;
  role: string;
  transit: AnnualTransitSnapshot;
  activatedPalaces: HemingAnnualPalaceActivation[];
}

export interface HemingAnnualDimensionView {
  dimensionId: string;
  label: string;
  description: string;
  ownerAActivations: HemingAnnualPalaceActivation[];
  ownerBActivations: HemingAnnualPalaceActivation[];
  activation: 'both' | 'A' | 'B' | 'none';
  observation: string;
}

export interface HemingAnnualTransitSnapshot {
  schemaVersion: 1;
  selectedYear: number;
  targetDate: string;
  representativeDate: string;
  boundaryPolicy: 'annual-midyear-representative-date';
  inputFingerprint: string;
  chartEngineVersion: string;
  transitEngineVersion: string;
  methodologyVersion: string;
  relationshipType: RelationshipType;
  roles: { A: string; B: string };
  ownerA: HemingAnnualOwnerView;
  ownerB: HemingAnnualOwnerView;
  dimensions: HemingAnnualDimensionView[];
  baselineResults: HemingRuleResult[];
  stageResults: HemingRuleResult[];
  warnings: string[];
  disclaimer: string;
}

export interface HemingTransitSnapshotRecord {
  id: string;
  conversationId: string;
  selectedYear: number;
  chartEngineVersion: string;
  transitEngineVersion: string;
  methodologyVersion: string;
  snapshot: HemingAnnualTransitSnapshot;
  createdAt: number;
  updatedAt: number;
}
