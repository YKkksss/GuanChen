import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-monthly-review-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { getLifeEvent } = await import('../lib/db/events');
  const { getMemoryItem } = await import('../lib/db/context');
  const { getMonthlyReview, listMonthlyReviews } = await import('../lib/db/monthly-reviews');
  const { createReminderRule, listReminderInstances } = await import('../lib/db/reminders');
  const reviewsRoute = await import('../app/api/monthly-reviews/route');
  const reviewRoute = await import('../app/api/monthly-reviews/[id]/route');
  const confirmRoute = await import('../app/api/monthly-reviews/[id]/confirm/route');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const birthInfo = {
      name: '月度复盘测试', year: 1990, month: 5, day: 12, hour: 3,
      gender: 'female' as const, province: '测试省', city: '测试市',
    };
    const conversation = createConversation({
      type: 'chart', title: '月度复盘命盘', birthInfo, chartSnapshot: generateChart(birthInfo),
    });
    const now = Date.parse('2026-08-10T04:00:00.000Z');
    const reminder = createReminderRule({
      title: '每月复盘', kind: 'monthly_review', conversationId: conversation.id,
      timezone: 'Asia/Shanghai', config: { kind: 'monthly_review', dayOfMonth: 22, hour: 9, minute: 0 },
    }, now);
    const reminderInstance = listReminderInstances({ ruleId: reminder.id, now })
      .find(item => item.scheduledFor === '2026-08-22')!;

    const createResponse = await reviewsRoute.POST(new Request('http://local/api/monthly-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversation.id,
        reminderInstanceId: reminderInstance.id,
        reviewMonth: '2026-08',
        importantEvents: '完成了一次重要项目交付。',
      }),
    }));
    assert.equal(createResponse.status, 201);
    const draft = (await json<{ review: { id: string; status: string } }>(createResponse)).review;
    assert.equal(draft.status, 'draft');

    const duplicateResponse = await reviewsRoute.POST(new Request('http://local/api/monthly-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, reviewMonth: '2026-08' }),
    }));
    assert.equal((await json<{ review: { id: string } }>(duplicateResponse)).review.id, draft.id, '同一命盘同月只能有一份复盘');

    const updateResponse = await reviewRoute.PATCH(new Request(`http://local/api/monthly-reviews/${draft.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: { career: 5, relationship: 3, health: 4, finance: 4 },
        priorPrediction: '事业方面预计会完成阶段性成果。',
        actualOutcome: '项目按时交付，工作强度增加，但结果符合预期。',
        predictionMatch: 'matched',
        corrections: '需要降低对短期进展速度的乐观估计。',
        nextFocus: '观察新项目资源是否按时到位。',
      }),
    }), { params: Promise.resolve({ id: draft.id }) });
    assert.equal(updateResponse.status, 200);

    const confirmResponse = await confirmRoute.POST(new Request(`http://local/api/monthly-reviews/${draft.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saveToMemory: true,
        event: { title: '完成重要项目交付', category: 'career', impactLevel: 4 },
      }),
    }), { params: Promise.resolve({ id: draft.id }) });
    assert.equal(confirmResponse.status, 200);
    const confirmed = (await json<{ review: { status: string; generatedEventId: string; generatedMemoryId: string } }>(confirmResponse)).review;
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(getLifeEvent(confirmed.generatedEventId)?.startDate, '2026-08');
    assert.match(getMemoryItem(confirmed.generatedMemoryId)!.content, /实际情况/);
    assert.equal(listReminderInstances({ ruleId: reminder.id, now: Date.parse('2026-08-23T04:00:00.000Z') })
      .find(item => item.id === reminderInstance.id)?.status, 'completed', '确认复盘后应自动完成来源提醒');

    const secondConfirm = await confirmRoute.POST(new Request(`http://local/api/monthly-reviews/${draft.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saveToMemory: true }),
    }), { params: Promise.resolve({ id: draft.id }) });
    assert.equal((await json<{ review: { generatedEventId: string } }>(secondConfirm)).review.generatedEventId, confirmed.generatedEventId, '重复确认不能重复沉淀数据');

    const lockedResponse = await reviewRoute.PATCH(new Request(`http://local/api/monthly-reviews/${draft.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actualOutcome: '试图修改' }),
    }), { params: Promise.resolve({ id: draft.id }) });
    assert.equal(lockedResponse.status, 400, '确认后应锁定复盘内容');

    const invalidCreateResponse = await reviewsRoute.POST(new Request('http://local/api/monthly-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, reviewMonth: '2026-13' }),
    }));
    assert.equal(invalidCreateResponse.status, 400);
    assert.equal(listMonthlyReviews({ conversationId: conversation.id }).length, 1);
    assert.ok(getMonthlyReview(draft.id)?.confirmedAt);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 22').get());

    console.log('M8-2 月度复盘测试通过：v22 迁移、草稿幂等、结构化反馈、确认锁定、事件/记忆沉淀和提醒完成均正常。');
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
