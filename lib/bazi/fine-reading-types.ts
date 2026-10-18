import type { BaziElement } from './types';
import type { MonthlyClimateReference } from './monthly-climate-rules';
export interface BaziClimateStemCheck {
  stem:string; role:'primary'|'support'|'conditional'; purpose:string;
  surface:string[]; hidden:string[]; exactRoots:string[]; sameElementRoots:string[];
  status:'surface_present'|'hidden_only'|'not_observed'|'unknown_time';
  condition:'reference'|'position_observed'|'not_observed'|'unknown_time'|'manual_review';
  combinations:string[]; rootClashes:string[]; cautions:string[];
}
export interface BaziSpecialPatternReview {
  id:string; label:string; status:'entry_observed'|'counterevidence'|'not_observed'|'unknown_time';
  conditions:string[]; observations:string[]; objections:string[]; pending:string[]; sourceUrl:string;
}
export interface BaziFineReview {
  version:string; reference:MonthlyClimateReference;
  coverage:{total:number;monthParagraphs:number;sharedParagraphs:number;periodConditional:number};
  stemChecks:BaziClimateStemCheck[]; specialPatterns:BaziSpecialPatternReview[];
  methodReview:Array<{element:BaziElement;reason:string}>;
  boundary:string;
}
