import type { BaziElement, BaziPillarKey } from '@/lib/bazi/types';
import type { PersonalElectionLuckAssessment, PersonalElectionLuckSnapshot } from './personal-luck-types';
export const PERSONAL_ELECTION_LEGACY_VERSION='personal-election-v1-relations-manual-elements';
export const PERSONAL_ELECTION_VERSION='personal-election-v2-luck-background';
export interface PersonalElectionParticipantInput {
  chartId:string; preferredElements:BaziElement[]; cautiousElements:BaziElement[]; basisNote:string;
}
export interface PersonalElectionInput {
  participants:PersonalElectionParticipantInput[];
  avoidDayYearClash:boolean; avoidDayBranchClash:boolean; avoidHourYearClash:boolean; avoidHourBranchClash:boolean;
  filterStems:boolean;
  includeLuckContext?:boolean;
}
export interface PersonalElectionChartOption {
  chartId:string;profileId:string;displayName:string;createdAt:number;pillars:string;unknownTime:boolean;policyLabel:string;
}
export interface PersonalElectionParticipantSnapshot extends PersonalElectionParticipantInput {
  profileId:string;displayName:string;chartFingerprint:string;chartMethodologyVersion:string;chartEngineVersion:string;
  pillars:Array<{key:BaziPillarKey;label:string;stem:string;branch:string}>;
  unknownTime:boolean;policyLabel:string;
  climateReference:{version:string;label:string;scope:string;detail:string};
  luck?:PersonalElectionLuckSnapshot;
}
export interface PersonalElectionSnapshot {
  version:string;source:string;input:PersonalElectionInput;participants:PersonalElectionParticipantSnapshot[];
}
export interface PersonalElectionRelation {
  type:'stem_combine'|'branch_clash'|'branch_combine'|'branch_repeat'|'three_harmony';
  label:string;detail:string;pillarKeys:BaziPillarKey[];
}
export interface PersonalElectionParticipantAssessment {
  chartId:string;displayName:string;unknownTime:boolean;
  relations:PersonalElectionRelation[];excludedReasons:string[];manualElementNote:string;
  luck?:PersonalElectionLuckAssessment;
}
export interface PersonalElectionAssessment {
  scope:'day'|'hour';targetGanZhi:string;participants:PersonalElectionParticipantAssessment[];
  excluded:boolean;reasons:string[];
}
