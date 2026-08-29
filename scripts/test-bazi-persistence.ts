import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-persistence-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const profileRoute = await import('../app/api/bazi/profiles/[id]/route');
  const chartsRoute = await import('../app/api/bazi/profiles/[id]/charts/route');
  const chartRoute = await import('../app/api/bazi/charts/[id]/route');
  const { getBaziBirthProfile, listBaziBirthProfiles } = await import('../lib/db/bazi');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const createResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '晚子时校验档案',
        birthDate: '1988-02-15', birthTime: '23:30', gender: 'female',
        unknownTime: false, timeZoneId: 'Asia/Shanghai', longitude: 116.4074,
        locationLabel: '北京市', notes: '用于多版本持久化测试',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    assert.equal(createResponse.status, 201);
    const created = (await json<{ profile: { id: string; charts: Array<{ id: string; result: { pillars: { day: { ganZhi: string } } } }> } }>(createResponse)).profile;
    assert.equal(created.charts.length, 1);
    assert.equal(created.charts[0].result.pillars.day.ganZhi, '庚子');
    const firstChartId = created.charts[0].id;

    const duplicateResponse = await chartsRoute.POST(new Request('http://local/charts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeStandard: 'civil_time', lateZiPolicy: 'same_day' }),
    }), { params: Promise.resolve({ id: created.id }) });
    const duplicate = (await json<{ chart: { id: string } }>(duplicateResponse)).chart;
    assert.equal(duplicate.id, firstChartId, '相同档案、引擎和规则应复用已有版本');

    const secondResponse = await chartsRoute.POST(new Request('http://local/charts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeStandard: 'civil_time', lateZiPolicy: 'next_day' }),
    }), { params: Promise.resolve({ id: created.id }) });
    const second = (await json<{ chart: { id: string; inputFingerprint: string; chartFingerprint: string; result: { pillars: { day: { ganZhi: string } } } } }>(secondResponse)).chart;
    assert.notEqual(second.id, firstChartId);
    assert.equal(second.result.pillars.day.ganZhi, '辛丑');

    const detail = getBaziBirthProfile(created.id)!;
    assert.equal(detail.charts.length, 2);
    assert.notEqual(detail.charts[0].inputFingerprint, detail.charts[1].inputFingerprint);
    assert.notEqual(detail.charts[0].chartFingerprint, detail.charts[1].chartFingerprint);
    assert.equal(detail.charts[0].methodologyVersion, 'bazi-foundation-v1');
    assert.equal(detail.charts[0].inputSnapshot.birthDate, '1988-02-15');

    const listResponse = await profilesRoute.GET(new Request('http://local/api/bazi/profiles?limit=20'));
    const listed = (await json<{ profiles: Array<{ id: string; chartCount: number; latestPillars: string }> }>(listResponse)).profiles;
    assert.equal(listed[0].id, created.id);
    assert.equal(listed[0].chartCount, 2);
    assert.match(listed[0].latestPillars, /戊辰 甲寅 辛丑 戊子/);

    const chartResponse = await chartRoute.GET(new Request('http://local/chart'), { params: Promise.resolve({ id: second.id }) });
    assert.equal((await json<{ chart: { id: string } }>(chartResponse)).chart.id, second.id);

    const renameResponse = await profileRoute.PATCH(new Request('http://local/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: '已重命名档案', locationLabel: '北京' }),
    }), { params: Promise.resolve({ id: created.id }) });
    assert.equal((await json<{ profile: { displayName: string } }>(renameResponse)).profile.displayName, '已重命名档案');

    const immutableResponse = await profileRoute.PATCH(new Request('http://local/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthDate: '1990-01-01' }),
    }), { params: Promise.resolve({ id: created.id }) });
    assert.equal(immutableResponse.status, 400, '出生事实不能通过展示字段接口改写');

    const samePersonResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '同出生数据的另一档案', birthDate: '1988-02-15', birthTime: '23:30',
        gender: 'female', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const sameBirthProfile = (await json<{ profile: { id: string } }>(samePersonResponse)).profile;
    assert.notEqual(sameBirthProfile.id, created.id, '不同档案不能仅因出生数据相同而被错误合并');

    const deleteChartResponse = await chartRoute.DELETE(new Request('http://local/chart', { method: 'DELETE' }), { params: Promise.resolve({ id: second.id }) });
    assert.equal(deleteChartResponse.status, 204);
    assert.equal(getBaziBirthProfile(created.id)?.charts.length, 1);

    const deleteProfileResponse = await profileRoute.DELETE(new Request('http://local/profile', { method: 'DELETE' }), { params: Promise.resolve({ id: created.id }) });
    assert.equal(deleteProfileResponse.status, 204);
    assert.equal(getBaziBirthProfile(created.id), null);
    const remainingCharts = getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_chart_versions WHERE birth_profile_id = ?')
      .get(created.id) as { count: number };
    assert.equal(remainingCharts.count, 0);
    assert.equal(listBaziBirthProfiles().length, 1);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 23').get());

    console.log('M9-1 八字持久化测试通过：v23 迁移、档案、多版本去重、双指纹、不可变出生事实、读取与级联删除均正常。');
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
