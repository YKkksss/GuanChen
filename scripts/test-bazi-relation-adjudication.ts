import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { auditBaziRelations } from '../lib/bazi/relation-audit-engine';
import { adjudicateBaziRelations } from '../lib/bazi/relation-adjudication-engine';
import { BAZI_RELATION_ADJUDICATION_METHODOLOGY } from '../lib/bazi/relation-adjudication-methodology';
import {
  assertValidBaziRelationAdjudicationMethodology,
  validateBaziRelationAdjudicationMethodology,
} from '../lib/bazi/relation-adjudication-validator';
import type { BaziRelationAdjudicationMethodology } from '../lib/bazi/relation-adjudication-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-relation-adjudication-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function createCompleteResult() {
  const chart = calculateBazi({ birthDate: '1990-01-01', birthTime: '12:00', gender: 'male' });
  const luckCycles = calculateBaziLuckCycles(chart);
  const annualTimeline = calculateBaziAnnualTimeline(chart, luckCycles);
  const relationAudit = auditBaziRelations(chart, luckCycles, annualTimeline);
  return { chart, relationAudit, adjudication: adjudicateBaziRelations(chart, relationAudit) };
}

async function main() {
  assert.deepEqual(validateBaziRelationAdjudicationMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziRelationAdjudicationMethodology());
  const complete = createCompleteResult();
  assert.equal(complete.adjudication.status, 'complete');
  assert.equal(complete.adjudication.capabilities.transformationVerdict, false);
  assert.equal(complete.adjudication.capabilities.relationPriorityVerdict, false);

  const year1998 = complete.adjudication.years.find(item => item.year === 1998)!;
  assert.equal(year1998.segments.length, 2, '跨运流年必须保持两个独立裁决片段');
  assert.ok(year1998.segments[0].decisions.every(item => item.participants.every(participant => participant.layer !== 'luck_cycle')));
  assert.ok(year1998.segments[1].conflicts.some(item => item.participant.layer === 'annual'));

  const year1999 = complete.adjudication.years.find(item => item.year === 1999)!;
  const missingMonthSupport = year1999.segments[0].decisions.find(item =>
    item.type === 'stem_five_combine' && item.participants.some(participant => participant.symbol === '己'),
  );
  assert.equal(missingMonthSupport?.state, 'conditions_missing');
  assert.ok(missingMonthSupport?.checks.some(check => check.code === 'month_support' && check.result === 'missing'));
  assert.ok(year1999.segments[0].decisions.some(item =>
    item.sourceEvidenceId === null && item.type === 'branch_three_harmony'
      && item.missingSymbols.includes('未'),
  ), '两字已出现时必须显式记录三字缺一');

  const year2001 = complete.adjudication.years.find(item => item.year === 2001)!;
  const supportedStemCombine = year2001.segments[0].decisions.find(item =>
    item.type === 'stem_five_combine' && item.state === 'conditions_met',
  );
  assert.ok(supportedStemCombine);
  assert.ok(supportedStemCombine.checks.some(check => check.code === 'month_support' && check.result === 'met'));
  assert.match(supportedStemCombine.boundary, /不等于合化成立/);

  const year2004 = complete.adjudication.years.find(item => item.year === 2004)!;
  const threePunishment = year2004.segments[0].decisions.find(item => item.type === 'branch_three_punishment');
  assert.equal(threePunishment?.state, 'relations_coexist');
  assert.ok(threePunishment?.coexistingEvidenceIds.length);
  assert.ok(year2004.segments[0].conflicts.some(item => item.participant.symbol === '申'));

  const unknownChart = calculateBazi({ birthDate: '1990-01-01', gender: 'male', unknownTime: true });
  const unknownLuck = calculateBaziLuckCycles(unknownChart);
  const unknownAnnual = calculateBaziAnnualTimeline(unknownChart, unknownLuck);
  const unknownAudit = auditBaziRelations(unknownChart, unknownLuck, unknownAnnual);
  const unknown = adjudicateBaziRelations(unknownChart, unknownAudit);
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment => segment.decisions.every(item =>
    item.participants.every(participant => participant.pillarKey !== 'time'),
  ))));

  const invalid = structuredClone(BAZI_RELATION_ADJUDICATION_METHODOLOGY) as BaziRelationAdjudicationMethodology;
  invalid.policy.conflictPolicy = 'auto_priority' as never;
  assert.ok(validateBaziRelationAdjudicationMethodology(invalid).some(item => item.includes('优先级')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const adjudicationRoute = await import('../app/api/bazi/charts/[id]/relation-adjudication/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-7 条件冲突审计测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await adjudicationRoute.POST(new Request('http://local/relation-adjudication', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ relationAdjudication: { id: string; relationAdjudicationFingerprint: string; result: typeof complete.adjudication } }>(firstResponse)).relationAdjudication;
    assert.equal(first.relationAdjudicationFingerprint.length, 64);
    assert.ok(first.result.years.find(item => item.year === 2004)?.segments[0].conflicts.length);
    const second = (await json<{ relationAdjudication: { id: string } }>(await adjudicationRoute.POST(
      new Request('http://local/relation-adjudication', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).relationAdjudication;
    assert.equal(second.id, first.id, '相同命盘、关系证据和方法版本应复用裁决版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; relationAdjudicationVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.relationAdjudicationVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-strength-v16');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2004年为什么是关系并见' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.relationAdjudicationVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字关系条件与冲突审计快照')));
    assert.ok(built.messages.some(message => message.content.includes('寅巳申三刑成员齐全')));
    assert.ok(built.messages.some(message => message.content.includes('关系并见')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('relation_condition_conflict_audit'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('relation_priority_verdict'));
    assert.deepEqual(findBaziOutputViolations('所以合化成功'), ['越权宣告合化']);
    assert.deepEqual(findBaziOutputViolations('此处应以六合优先，六冲已经解掉'), ['越权裁决关系优先级']);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 29').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_relation_adjudication_versions').get() as { count: number }).count, 1);

    console.log('M9-7 关系条件与冲突审计测试通过：五合入口、三字缺一、关系并见、跨运分段、v29 持久化与上下文边界均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
