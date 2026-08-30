import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import { auditBaziRelations } from '../lib/bazi/relation-audit-engine';
import { BAZI_RELATION_AUDIT_METHODOLOGY } from '../lib/bazi/relation-audit-methodology';
import {
  assertValidBaziRelationAuditMethodology,
  validateBaziRelationAuditMethodology,
} from '../lib/bazi/relation-audit-validator';
import type { BaziRelationAuditMethodology } from '../lib/bazi/relation-audit-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-relation-audit-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function createCompleteResult() {
  const chart = calculateBazi({ birthDate: '1990-01-01', birthTime: '12:00', gender: 'male' });
  const luckCycles = calculateBaziLuckCycles(chart);
  const annualTimeline = calculateBaziAnnualTimeline(chart, luckCycles);
  return { chart, luckCycles, annualTimeline, audit: auditBaziRelations(chart, luckCycles, annualTimeline) };
}

async function main() {
  assert.deepEqual(validateBaziRelationAuditMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziRelationAuditMethodology());
  const complete = createCompleteResult();
  assert.equal(complete.audit.status, 'complete');
  assert.equal(complete.audit.capabilities.transformationVerdict, false);
  assert.equal(complete.audit.capabilities.fortuneInterpretation, false);

  const year1998 = complete.audit.years.find(item => item.year === 1998)!;
  assert.equal(year1998.segments.length, 2, '年中交运必须分别审计前后片段');
  assert.ok(year1998.segments[0].evidence.every(item => !item.participants.some(participant => participant.layer === 'luck_cycle')));
  assert.ok(year1998.segments[1].evidence.some(item =>
    item.type === 'branch_six_combine' && item.scope === 'annual_to_luck'
      && item.participants.map(participant => participant.symbol).sort().join('') === '亥寅',
  ));

  const year1999 = complete.audit.years.find(item => item.year === 1999)!;
  const stemCombine = year1999.segments[0].evidence.find(item => item.type === 'stem_five_combine');
  assert.equal(stemCombine?.targetElement, '土');
  assert.equal(stemCombine?.conclusion, 'detected_not_transformed');
  assert.ok(stemCombine?.participants.some(item => item.label === '原局时柱' && item.symbol === '甲'));

  const year2002 = complete.audit.years.find(item => item.year === 2002)!;
  assert.ok(year2002.segments[0].evidence.some(item => item.type === 'branch_self_punishment' && item.label.includes('午午自刑')));
  const year2004 = complete.audit.years.find(item => item.year === 2004)!;
  assert.ok(year2004.segments[0].evidence.some(item => item.type === 'branch_three_punishment' && item.label.includes('寅巳申')));
  const year2006 = complete.audit.years.find(item => item.year === 2006)!;
  const harmony = year2006.segments[0].evidence.find(item => item.type === 'branch_three_harmony');
  assert.equal(harmony?.targetElement, '火');
  assert.equal(harmony?.conclusion, 'detected_not_transformed');

  const unknownChart = calculateBazi({ birthDate: '1990-01-01', gender: 'male', unknownTime: true });
  const unknownLuck = calculateBaziLuckCycles(unknownChart);
  const unknownAnnual = calculateBaziAnnualTimeline(unknownChart, unknownLuck);
  const unknown = auditBaziRelations(unknownChart, unknownLuck, unknownAnnual);
  assert.equal(unknown.status, 'partial_unknown_time');
  assert.ok(unknown.years.every(year => year.segments.every(segment => segment.evidence.every(item =>
    item.participants.every(participant => participant.pillarKey !== 'time'),
  ))));

  const unsupportedChart = calculateBazi({
    birthDate: '1990-01-01', birthTime: '12:00', gender: 'male',
    timeZoneId: 'America/New_York', timeStandard: 'civil_time',
  });
  const unsupportedLuck = calculateBaziLuckCycles(unsupportedChart);
  const unsupportedAnnual = calculateBaziAnnualTimeline(unsupportedChart, unsupportedLuck);
  const unsupported = auditBaziRelations(unsupportedChart, unsupportedLuck, unsupportedAnnual);
  assert.equal(unsupported.status, 'annual_only_without_luck_boundary');
  assert.ok(unsupported.years.every(year => year.segments.every(segment =>
    segment.evidence.every(item => item.participants.every(participant => participant.layer !== 'luck_cycle')),
  )));

  const invalid = structuredClone(BAZI_RELATION_AUDIT_METHODOLOGY) as BaziRelationAuditMethodology;
  invalid.policy.transformationPolicy = 'auto_transform' as never;
  assert.ok(validateBaziRelationAuditMethodology(invalid).some(item => item.includes('不判化')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const relationRoute = await import('../app/api/bazi/charts/[id]/relation-audit/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-6 关系审计测试', birthDate: '1990-01-01', birthTime: '12:00',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await relationRoute.POST(new Request('http://local/relation-audit', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ relationAudit: { id: string; relationAuditFingerprint: string; result: typeof complete.audit } }>(firstResponse)).relationAudit;
    assert.equal(first.relationAuditFingerprint.length, 64);
    assert.ok(first.result.years.find(item => item.year === 2004)?.segments[0].evidence.some(item => item.type === 'branch_three_punishment'));
    const second = (await json<{ relationAudit: { id: string } }>(await relationRoute.POST(
      new Request('http://local/relation-audit', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).relationAudit;
    assert.equal(second.id, first.id, '相同三层输入和方法版本应复用关系审计版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; relationAuditVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.relationAuditVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-strength-v16');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2004年命中的干支关系' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.relationAuditVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字干支关系证据快照')));
    assert.ok(built.messages.some(message => message.content.includes('寅巳申三刑成员齐全')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('relation_evidence_audit'));
    assert.deepEqual(findBaziOutputViolations('所以可以判定合化成功'), ['越权宣告合化']);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 28').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_relation_audit_versions').get() as { count: number }).count, 1);

    console.log('M9-6 关系审计测试通过：跨层生克五合、冲合刑害、成组规则、跨运分段、降级、v28 持久化与上下文绑定均正常。');
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
