import { getRelationshipDefinition } from '@/lib/heming/methodology';
import type {
  HemingEvaluationResult,
  HemingRelationshipContext,
  PalaceName,
} from '@/lib/heming/types';
import type { ReportEvidenceDraft } from './types';

/** 将合盘评估结果转换成可被报告章节引用的稳定证据。 */
export function buildHemingReportEvidence(
  evaluation: HemingEvaluationResult,
  relationshipContext: HemingRelationshipContext | null,
): ReportEvidenceDraft[] {
  const definition = getRelationshipDefinition(evaluation.relationshipType);
  const evidence: ReportEvidenceDraft[] = [];

  evidence.push({
    evidenceKey: 'heming:context',
    kind: 'heming_context',
    label: `关系背景：${definition.label}`,
    source: 'user_confirmed',
    facts: {
      relationshipType: evaluation.relationshipType,
      relationshipLabel: definition.label,
      roles: evaluation.roles,
      mainConcern: relationshipContext?.mainConcern ?? null,
      customRelationshipLabel: relationshipContext?.customRelationshipLabel ?? null,
      confirmedFacts: relationshipContext?.confirmedFacts ?? {},
    },
  });

  for (const owner of ['A', 'B'] as const) {
    const palaceNames = uniquePalaces(definition.dimensions.flatMap(dimension => (
      owner === 'A' ? dimension.ownerAPalaces : dimension.ownerBPalaces
    )));
    for (const palaceName of palaceNames) {
      const palace = evaluation.facts[owner].palaces[palaceName];
      evidence.push({
        evidenceKey: `heming:palace:${owner}:${palaceName}`,
        kind: 'heming_palace',
        label: `${owner === 'A' ? '甲方' : '乙方'} · ${evaluation.roles[owner]} · ${palaceName}`,
        source: 'chart_snapshot',
        facts: {
          owner,
          role: evaluation.roles[owner],
          palace: palace.palace,
          branch: palace.branch,
          isEmpty: palace.isEmpty,
          birthTimeKnown: evaluation.facts[owner].birthTimeKnown,
          stars: palace.stars.map(star => ({
            name: star.name,
            type: star.type,
            siHua: star.siHua ?? null,
            brightness: star.brightness ?? null,
          })),
        },
      });
    }

    const stage = evaluation.facts[owner].currentStage;
    if (stage) {
      evidence.push({
        evidenceKey: `heming:stage:${owner}:${stage.startAge}-${stage.endAge}`,
        kind: 'heming_stage',
        label: `${owner === 'A' ? '甲方' : '乙方'}当前阶段 ${stage.startAge}-${stage.endAge} 岁`,
        source: 'chart_snapshot',
        facts: {
          owner,
          role: evaluation.roles[owner],
          palace: stage.palace,
          branch: stage.branch,
          startAge: stage.startAge,
          endAge: stage.endAge,
        },
      });
    }
  }

  const evidenceById = new Map(evaluation.evidence.map(item => [item.id, item]));
  for (const result of evaluation.matchedRules) {
    evidence.push({
      evidenceKey: `heming:rule:${result.phase}:${result.ruleId}`,
      kind: 'heming_rule',
      label: `规则：${result.ruleName}`,
      source: 'rule_engine',
      facts: {
        ruleId: result.ruleId,
        ruleVersion: result.ruleVersion,
        dimensionId: result.dimensionId,
        phase: result.phase,
        level: result.level,
        confidence: result.confidence,
        degradedByRuleIds: result.degradedByRuleIds,
        conclusion: result.conclusion,
        advice: result.advice,
        evidence: result.evidenceIds.map(id => {
          const item = evidenceById.get(id);
          return item ? { id, owner: item.owner, label: item.label } : { id };
        }),
      },
    });
  }

  return evidence;
}

function uniquePalaces(palaces: PalaceName[]): PalaceName[] {
  return [...new Set(palaces)];
}
