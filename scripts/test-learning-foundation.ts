import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-learning-foundation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const { getLearningNote, listLearningNotes, saveLearningNote } = await import('../lib/db/learning');
  const { LEARNING_NOTE_KNOWLEDGE_POINT, buildPalaceLearningLesson } = await import('../lib/learning/service');

  try {
    const birthInfo = { name: '学习测试', year: 1991, month: 8, day: 12, hour: 6, gender: 'female' as const };
    const chart = generateChart(birthInfo);
    const lesson = buildPalaceLearningLesson(chart, chart.mingGongBranch);
    assert.equal(lesson.steps.length, 7);
    assert.equal(lesson.facts.isMingGong, true);
    assert.deepEqual(
      lesson.facts.relations.map(item => item.branch),
      [chart.mingGongBranch, (chart.mingGongBranch + 6) % 12, (chart.mingGongBranch + 4) % 12, (chart.mingGongBranch + 8) % 12],
    );
    assert.ok(lesson.sources.some(item => item.id === 'classic:gusuifu:sanfang'));
    assert.match(lesson.steps.find(item => item.key === 'boundary')!.fact, /本命命盘结构事实/);
    assert.ok(lesson.knowledgePoints.every(item => item.sourceIds.length > 0));

    const emptyChart = structuredClone(chart);
    const emptyPalace = emptyChart.palaces[0];
    const opposite = emptyChart.palaces.find(item => item.branch === (emptyPalace.branch + 6) % 12)!;
    emptyPalace.stars = emptyPalace.stars.filter(item => item.type !== 'major');
    emptyPalace.isEmpty = true;
    emptyPalace.borrowedFromBranch = opposite.branch;
    emptyPalace.borrowedFromName = opposite.name;
    emptyPalace.borrowedStars = opposite.stars.filter(item => item.type === 'major').map(item => item.name);
    const emptyLesson = buildPalaceLearningLesson(emptyChart, emptyPalace.branch);
    assert.equal(emptyLesson.facts.isEmpty, true);
    assert.equal(emptyLesson.facts.borrowedFrom?.branch, (emptyPalace.branch + 6) % 12);
    assert.match(emptyLesson.steps.find(item => item.key === 'empty-palace')!.fact, /为空宫/);
    assert.throws(() => buildPalaceLearningLesson(chart, 12), /0 到 11/);

    const conversation = createConversation({ type: 'chart', title: '学习模式测试', birthInfo, chartSnapshot: chart });
    const noteKey = { conversationId: conversation.id, knowledgePointId: LEARNING_NOTE_KNOWLEDGE_POINT, palaceBranch: chart.mingGongBranch };
    const created = saveLearningNote({ ...noteKey, content: '先确认命宫，再查看三方四正。' });
    assert.equal(created?.content, '先确认命宫，再查看三方四正。');
    assert.equal(getLearningNote(noteKey)?.id, created?.id);
    const updated = saveLearningNote({ ...noteKey, content: '补充：本命四化和流年四化不能混淆。' });
    assert.equal(updated?.id, created?.id, '同一命盘同一宫位应更新原笔记');
    assert.equal(listLearningNotes(conversation.id).length, 1);
    assert.equal(saveLearningNote({ ...noteKey, content: '   ' }), null, '空内容用于清空笔记');
    assert.equal(listLearningNotes(conversation.id).length, 0);
    assert.throws(() => saveLearningNote({ ...noteKey, content: '测'.repeat(4001) }), /4000/);
    saveLearningNote({ ...noteKey, content: '级联删除测试' });
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(listLearningNotes(conversation.id).length, 0, '删除会话后学习笔记必须级联删除');
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 14').get());

    console.log('M6-0/M6-1 学习基础测试通过：七步读盘、三方四正、空宫借星、来源契约、笔记持久化与级联删除均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
