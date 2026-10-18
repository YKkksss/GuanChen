import type { BaziRelationEvidence } from '@/lib/bazi/relation-audit-types';
import type { BaziRelationNodeInput } from '@/lib/bazi/relation-audit-engine';
import type { TransitTransform } from '@/lib/transits/types';
import type { SynthesisTopic } from './types';

export const SYNTHESIS_DYNAMIC_REVIEW_VERSION = 'synthesis-dynamic-review-v1-topic-cross-layer';

export interface SynthesisTopicAnchor {
  topicPalace: string;
  reference: 'natal_topic' | 'dynamic_topic';
  branch: number;
  nativePalaceName: string;
}
export interface SynthesisTransformReview extends TransitTransform {
  evidenceId: string;
  located: boolean;
  hits: Array<SynthesisTopicAnchor & { relation: 'direct' | 'opposite' | 'trine' }>;
}
export interface SynthesisDynamicReview {
  version: string;
  topic: SynthesisTopic;
  observation: string;
  scope: string;
  status: 'available' | 'partial_unknown_time' | 'birth_time_unconfirmed';
  ziwei: {
    referenceOnly: boolean;
    layers: Array<{
      level: 'year' | 'month';
      label: string;
      engineVersion: string;
      anchors: SynthesisTopicAnchor[];
      transformations: SynthesisTransformReview[];
    }>;
    boundaries: string[];
  };
  bazi: {
    methodologyVersion: string;
    engineVersion: string;
    nodes: BaziRelationNodeInput[];
    relations: Array<BaziRelationEvidence & { evidenceId: string }>;
    topicRoles: Array<{
      key: 'luck' | 'year' | 'month'; label: string; ganZhi: string;
      stemTenGod: string; matchesTopic: boolean;
      hiddenStems: Array<{ stem: string; tenGod: string; matchesTopic: boolean }>;
    }>;
    boundaries: string[];
  };
  sideBySide: Array<{ id: string; label: string; ziwei: string; bazi: string }>;
  sources: Array<{ id: string; system: 'ziwei' | 'bazi'; title: string; version: string; note: string; url?: string }>;
  boundaries: string[];
}
