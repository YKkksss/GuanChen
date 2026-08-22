import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-case-search-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { createLifeEvent } = await import('../lib/db/events');
  const { createCaseFromConversation } = await import('../lib/cases/service');
  const { getCaseTeachingDetail } = await import('../lib/cases/teaching-service');
  const { setCaseConsent, updateCaseRecord } = await import('../lib/db/cases');
  const { deriveCaseSearchFacets, searchTeachingCases } = await import('../lib/db/case-search');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const createSource = (name: string, year: number, month: number, day: number, hour: number) => {
      const birthInfo = { name, year, month, day, hour, gender: 'male' as const, province: '测试省', city: '测试市' };
      const chart = generateChart(birthInfo);
      return createConversation({ type: 'chart', title: `${name}的命盘`, birthInfo, chartSnapshot: chart });
    };
    const sourceA = createSource('检索隐私姓名甲', 1990, 5, 12, 3);
    const sourceB = createSource('检索隐私姓名乙', 1988, 9, 2, 7);
    const sourceC = createSource('检索隐私姓名丙', 1995, 11, 18, 9);
    createLifeEvent(sourceA.id, {
      title: '不应进入教学详情的完整工作事件', category: 'career', startDate: '2015-06-18',
      datePrecision: 'day', description: '具体公司和详细地址不应出现', impactLevel: 4, confirmedByUser: true,
    });

    const caseA = createCaseFromConversation({
      conversationId: sourceA.id, acknowledged: true, title: '职业结构教学案例', scopes: ['teaching'],
    });
    const caseB = createCaseFromConversation({
      conversationId: sourceB.id, acknowledged: true, title: '无教学授权案例', scopes: [],
    });
    const caseC = createCaseFromConversation({
      conversationId: sourceC.id, acknowledged: true, title: '尚未复核案例', scopes: ['teaching'],
    });
    updateCaseRecord(caseA.id, { status: 'reviewed' });
    updateCaseRecord(caseB.id, { status: 'reviewed' });

    const initial = searchTeachingCases();
    assert.equal(initial.total, 1, '教学检索只能返回已复核且教学授权有效的案例');
    assert.equal(initial.cases[0].id, caseA.id);
    assert.ok(!JSON.stringify(initial).includes(sourceA.id), '检索结果不能返回来源会话编号');
    assert.ok(!JSON.stringify(initial).includes('检索隐私姓名甲'), '检索结果不能返回来源姓名');

    const facets = deriveCaseSearchFacets(caseA.chartSnapshot, ['career']);
    const mingBranch = facets.find(facet => facet.type === 'ming_branch')!;
    const majorStar = facets.find(facet => facet.type === 'ming_major_star');
    const sihua = facets.find(facet => facet.type === 'sihua');
    const pattern = facets.find(facet => facet.type === 'pattern');
    assert.equal(searchTeachingCases({ mingBranch: Number(mingBranch.value) }).total, 1);
    if (majorStar) assert.equal(searchTeachingCases({ majorStar: majorStar.value }).total, 1);
    if (sihua) assert.equal(searchTeachingCases({ sihua: sihua.value }).total, 1);
    if (pattern) assert.equal(searchTeachingCases({ pattern: pattern.value }).total, 1);
    assert.equal(searchTeachingCases({ wuxingJu: caseA.chartSnapshot.wuxingJuName }).total, 1);
    assert.equal(searchTeachingCases({ eventCategory: 'career' }).total, 1);
    assert.equal(searchTeachingCases({ query: '职业结构' }).total, 1);
    assert.equal(searchTeachingCases({ majorStar: '不存在的星曜' }).total, 0);

    const teaching = getCaseTeachingDetail(caseA.id);
    assert.equal(teaching.caseCode, caseA.caseCode);
    assert.equal(teaching.evidence.length, 4);
    assert.equal(teaching.studySteps.length, 4);
    assert.equal(teaching.discussionQuestions.length, 4);
    const teachingJson = JSON.stringify(teaching);
    for (const sensitive of ['检索隐私姓名甲', '1990-05-12', '测试省', '测试市', '完整工作事件', '具体公司']) {
      assert.ok(!teachingJson.includes(sensitive), `教学详情不能包含：${sensitive}`);
    }

    setCaseConsent({ caseId: caseA.id, scope: 'teaching', active: false });
    assert.equal(searchTeachingCases().total, 0, '撤销教学授权后案例必须立即从检索结果消失');
    assert.throws(() => getCaseTeachingDetail(caseA.id), /授权/);
    setCaseConsent({ caseId: caseA.id, scope: 'teaching', active: true });
    updateCaseRecord(caseA.id, { status: 'archived' });
    assert.equal(searchTeachingCases().total, 0, '归档案例不能进入教学检索');
    updateCaseRecord(caseA.id, { status: 'reviewed' });
    assert.equal(searchTeachingCases().total, 1);

    const storedFacets = getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM case_search_facets WHERE case_id = ?
    `).get(caseA.id) as { count: number };
    assert.ok(storedFacets.count >= 4);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 19').get());
    assert.equal(
      (getDatabase().prepare('SELECT search_index_version FROM case_records WHERE id = ?').get(caseC.id) as { search_index_version: number }).search_index_version,
      1,
      '首次检索需要回填所有旧案例的匿名结构索引',
    );

    console.log('M7-1 案例检索测试通过：v19 索引、组合筛选、教学授权闸门、匿名教学详情与撤销即时生效均正常。');
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
