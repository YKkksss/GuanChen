import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-interpretation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const { calculateBazi } = await import('../lib/bazi/engine');
  const { analyzeBaziInterpretation } = await import('../lib/bazi/interpretation-engine');
  const { BAZI_INTERPRETATION_METHODOLOGY } = await import('../lib/bazi/interpretation-methodology');
  const { validateBaziInterpretationMethodology } = await import('../lib/bazi/interpretation-validator');
  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const analysisRoute = await import('../app/api/bazi/charts/[id]/analysis/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { buildBaziConversationContext } = await import('../lib/context/bazi-builder');
  const { appendBaziMessage, getBaziConversation } = await import('../lib/db/bazi-conversations');
  const { deleteBaziChartVersion } = await import('../lib/db/bazi');
  const { getDatabase } = await import('../lib/db/client');

  try {
    assert.deepEqual(validateBaziInterpretationMethodology(BAZI_INTERPRETATION_METHODOLOGY), []);
    const fixture = analyzeBaziInterpretation(calculateBazi({
      birthDate: '2005-12-23', birthTime: '08:37', gender: 'male',
    }));
    assert.equal(fixture.methodologyVersion, 'bazi-interpretation-audit-v1');
    assert.equal(fixture.engineVersion, 'bazi-analysis-engine-v1');
    assert.equal(fixture.strength.assessment, 'mixed_evidence');
    assert.equal(fixture.strength.monthMainQiStem, '癸');
    assert.equal(fixture.strength.monthRelation, 'output');
    assert.ok(fixture.strength.roots.some(root => root.branch === '酉' && root.hiddenStem === '辛'));
    assert.equal(fixture.pattern.candidates[0].label, '食神格候选');
    assert.equal(fixture.pattern.candidates[0].status, 'candidate');
    assert.equal(fixture.usefulGod.finalSelection, null);
    assert.deepEqual(fixture.usefulGod.methods.find(method => method.method === 'climate')?.candidateElements, ['火']);
    assert.ok(!JSON.stringify(fixture).includes('score'), '旺衰审计不得输出伪精确分数');

    const supporting = analyzeBaziInterpretation(calculateBazi({
      birthDate: '1985-02-15', birthTime: '12:00', gender: 'female',
    }));
    assert.equal(supporting.strength.assessment, 'supporting_evidence_established');
    assert.deepEqual(
      supporting.usefulGod.methods.find(method => method.method === 'balancing')?.candidateRoles,
      ['食伤', '财', '官杀'],
    );
    assert.match(supporting.usefulGod.methods.find(method => method.method === 'balancing')!.boundary, /不是最终用神/);

    const draining = analyzeBaziInterpretation(calculateBazi({
      birthDate: '1986-06-15', birthTime: '12:00', gender: 'male',
    }));
    assert.equal(draining.strength.assessment, 'draining_evidence_established');
    assert.deepEqual(
      draining.usefulGod.methods.find(method => method.method === 'balancing')?.candidateRoles,
      ['印', '比劫'],
    );

    const unknown = analyzeBaziInterpretation(calculateBazi({
      birthDate: '1999-06-07', gender: 'male', unknownTime: true,
    }));
    assert.equal(unknown.strength.assessment, 'insufficient_due_to_unknown_time');
    assert.equal(unknown.strength.confidence, 'low');
    assert.equal(unknown.usefulGod.methods.find(method => method.method === 'balancing')?.status, 'withheld');

    const interaction = analyzeBaziInterpretation(calculateBazi({
      birthDate: '1980-01-15', birthTime: '12:00', gender: 'male',
    }));
    assert.ok(interaction.pattern.interactions.some(item => item.type === 'clash' && item.involvesMonthBranch));
    assert.equal(interaction.pattern.requiresManualReview, true);
    assert.ok(interaction.pattern.candidates.every(candidate => candidate.status === 'review_required'));

    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-3 证据版本测试', birthDate: '2005-12-23', birthTime: '08:37',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const routeContext = { params: Promise.resolve({ id: chartId }) };
    const createdAnalysis = (await json<{ analysis: { id: string; analysisFingerprint: string } }>(
      await analysisRoute.POST(new Request('http://local/analysis', { method: 'POST' }), routeContext),
    )).analysis;
    const reusedAnalysis = (await json<{ analysis: { id: string } }>(
      await analysisRoute.POST(new Request('http://local/analysis', { method: 'POST' }), routeContext),
    )).analysis;
    assert.equal(reusedAnalysis.id, createdAnalysis.id, '同一方法与引擎必须复用解释版本');
    assert.equal(createdAnalysis.analysisFingerprint.length, 64);
    const listed = await json<{ versions: Array<{ id: string }> }>(
      await analysisRoute.GET(new Request('http://local/analysis'), routeContext),
    );
    assert.equal(listed.versions.length, 1);

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; analysisVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.analysisVersionId, createdAnalysis.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-relation-adjudication-v6');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '解释旺衰证据和格局候选。' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.ok(built.messages.some(message => message.content.includes('权威八字解释证据快照')));
    assert.equal(built.manifest.analysisVersionId, createdAnalysis.id);
    assert.deepEqual(built.manifest.allowedCapabilities, [
      'strength_evidence_audit', 'pattern_candidates', 'useful_god_method_separation', 'luck_cycle_schedule', 'annual_timeline_schedule', 'relation_evidence_audit', 'relation_condition_conflict_audit',
    ]);

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 25').get());
    assert.equal(deleteBaziChartVersion(chartId), true);
    assert.equal(getBaziConversation(conversation.id), null);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_analysis_versions WHERE chart_version_id = ?').get(chartId) as { count: number }).count, 0);

    console.log('M9-3 八字解释测试通过：方法论、旺衰证据、格局候选、取用分层、未知时辰降级、结构复核、v25 版本持久化与对话绑定均正常。');
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
