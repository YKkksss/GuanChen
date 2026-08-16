import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-rectification-session-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const {
    createRectificationSession,
    findRectificationSession,
    findRectificationSessions,
    removeRectificationSession,
  } = await import('../lib/rectification/service');
  const { convertCivilTimeToApparentSolar } = await import('../lib/rectification/time-service');

  try {
    const beijing = convertCivilTimeToApparentSolar({
      date: '1990-06-15',
      time: '12:00',
      timeZoneId: 'Asia/Shanghai',
      longitude: 116.4074,
    });
    // 中国大陆 1990 年夏季曾实行夏令时，历史偏移应为 UTC+9，而不是今天常见的 UTC+8。
    assert.equal(beijing.selectedUtcOffsetMinutes, 540);
    assert.equal(beijing.localTimeStatus, 'unique');
    assert.equal(beijing.slotKey, 'si');
    assert.ok(beijing.apparentSolarTime.startsWith('10:'));
    assert.equal(beijing.timePolicyVersion, 'rectification-time-v1');

    assert.throws(() => convertCivilTimeToApparentSolar({
      date: '2021-11-07',
      time: '01:30',
      timeZoneId: 'America/New_York',
      longitude: -74.006,
    }), /出现两次/);
    const newYorkFold = convertCivilTimeToApparentSolar({
      date: '2021-11-07',
      time: '01:30',
      timeZoneId: 'America/New_York',
      longitude: -74.006,
      preferredUtcOffsetMinutes: -240,
    });
    assert.equal(newYorkFold.localTimeStatus, 'ambiguous');
    assert.deepEqual(newYorkFold.utcCandidates.map(item => item.utcOffsetMinutes), [-240, -300]);
    assert.throws(() => convertCivilTimeToApparentSolar({
      date: '2021-03-14',
      time: '02:30',
      timeZoneId: 'America/New_York',
      longitude: -74.006,
    }), /不存在/);

    const session = createRectificationSession({
      title: '完整十三时段校时测试',
      baseBirthInfo: {
        year: 1990,
        month: 6,
        day: 15,
        gender: 'male',
        name: '测试者',
        province: '北京市',
        city: '北京市',
        longitude: 116.4074,
      },
      reportedTimeEvidence: {
        source: 'birth_certificate',
        precision: 'exact',
        reportedStartLocal: '12:00',
        reportedEndLocal: '12:00',
        timezoneId: 'Asia/Shanghai',
        longitude: 116.4074,
        latitude: 39.9042,
        notes: '证件记录时间',
      },
    });
    assert.equal(session.status, 'ready');
    assert.equal(session.candidates.length, 13);
    assert.deepEqual(session.candidates.map(item => item.engineTimeIndex), Array.from({ length: 13 }, (_, index) => index));
    assert.equal(session.candidates[0].slotKey, 'early_zi');
    assert.equal(session.candidates[12].slotKey, 'late_zi');
    assert.equal(session.candidates[12].branchIndex, 0);
    assert.equal(session.timeConversion?.slotKey, 'si');
    assert.ok(session.candidates.every(item => item.chartFingerprint.length === 64));
    assert.ok(session.candidates.every(item => item.chartSnapshot.palaces.length === 12));

    const restored = findRectificationSession(session.id);
    assert.equal(restored?.reportedTimeEvidence.source, 'birth_certificate');
    assert.equal(restored?.candidates.length, 13);
    assert.equal(findRectificationSessions()[0].candidateCount, 13);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 9').get());

    assert.throws(() => createRectificationSession({
      baseBirthInfo: { year: 1990, month: 2, day: 30, gender: 'female' },
      candidateSlotKeys: ['early_zi', 'late_zi'],
    }), /出生日期无效/);
    assert.throws(() => createRectificationSession({
      baseBirthInfo: { year: 1990, month: 6, day: 15, gender: 'female' },
      candidateSlotKeys: ['early_zi'],
    }), /2 至 13/);

    assert.equal(removeRectificationSession(session.id), true);
    assert.equal(findRectificationSession(session.id), null);
    const remainingCandidates = getDatabase().prepare(
      'SELECT COUNT(*) AS count FROM rectification_candidates WHERE session_id = ?',
    ).get(session.id) as { count: number };
    assert.equal(remainingCandidates.count, 0, '删除会话时必须级联删除候选命盘');

    console.log('M5-1 校时会话测试通过：历史时区、均时差、夏令时边界、十三候选、指纹、SQLite 持久化和级联删除均正常。');
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
