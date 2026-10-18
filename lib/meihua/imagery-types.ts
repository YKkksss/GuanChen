import type { Line, Trigram } from './types';
import type { MeihuaSeasonState } from './reading-types';

export const MEIHUA_IMAGERY_VERSION = 'meihua-imagery-v1-symbols-line-provenance';
export const MEIHUA_SYMBOL_CATALOG_VERSION = 'meihua-neutral-symbol-catalog-v1';
export type MeihuaImageryNodeKey = 'body' | 'primary' | 'mutual_lower' | 'mutual_upper' | 'changed';
export interface MeihuaSymbolEntry {
  trigramNumber: number;
  nature: string[];
  objects: string[];
  forms: string[];
  sourceId: string;
}
export interface MeihuaImageryNode {
  key: MeihuaImageryNodeKey;
  label: string;
  trigram: Trigram;
  sourceBoard: 'primary' | 'changed';
  sourceLinePositions: number[];
  containsMovingOrigin: boolean;
  changedApplied: boolean;
  lineTrace: Array<{ position: number; originalPosition: number; originalValue: Line; value: Line; flipped: boolean }>;
  symbolicCandidates: MeihuaSymbolEntry;
  relationship: string;
  seasonState: MeihuaSeasonState | null;
  evidenceId: string;
}
export interface MeihuaImagery {
  version: string;
  catalogVersion: string;
  mutualSource: 'primary' | 'changed';
  nodes: MeihuaImageryNode[];
  change: { from: 'primary'; to: 'changed'; originalMovingLine: number; localMovingLine: number; before: Line; after: Line; fixedBodyKey: 'body'; evidenceId: string };
  overlaps: Array<{ left: MeihuaImageryNodeKey; right: MeihuaImageryNodeKey; originalLines: number[]; differentValues: number[]; sameTrigram: boolean; evidenceId: string }>;
  sources: Array<{ id: string; title: string; url: string; note: string }>;
  boundaries: string[];
}
