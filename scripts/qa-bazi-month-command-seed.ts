import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection } from '../lib/db/client';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { claimBaziReading, finishBaziReading } from '../lib/db/bazi-readings';
import { getBaziReadingDetail } from '../lib/bazi/reading-service';
import { BAZI_READING_SECTIONS, type BaziReadingFacts } from '../lib/bazi/reading-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
async function main() {
  const username = `month-command-${randomUUID().slice(0, 8)}`, password = `${randomUUID()}!Qa`;
  const user = await registerUser({ username, password, displayName: '司事分日合成验收' });
  const definitions = [
    { key: 'current', label: '卯月甲木与月藏分别核对', date: '2026-03-09', legacy: true },
    { key: 'literal', label: '艮土只留原字', date: '2026-02-05' },
    { key: 'different', label: '辰月壬水不补入藏干', date: '2026-04-14' },
    { key: 'unknownSegment', label: '未知时辰跨分日', date: '2026-03-12', unknown: true },
    { key: 'unknownJie', label: '未知时辰跨交节', date: '2026-03-05', unknown: true },
    { key: 'tail', label: '长节月三十日尾段', date: '2026-07-06' },
    { key: 'short', label: '短节月截断', date: '2026-02-03' },
    { key: 'dst', label: '历史节月跨夏令时', date: '1991-09-20' },
    { key: 'solar', label: '真太阳时不混作北京时间', date: '2026-03-09', solar: true },
  ];
  const cases = runAsUser(user, () => definitions.map(item => {
    const profile = createBaziBirthProfile({ displayName: `合成验收·${item.label}`, birthDate: item.date, birthTime: item.unknown ? undefined : '12:00:00', unknownTime: item.unknown ?? false, gender: 'female', longitude: item.solar ? 120 : undefined, timeZoneId: 'Asia/Shanghai', initialChart: { timeStandard: item.solar ? 'apparent_solar_time' : 'civil_time', lateZiPolicy: 'next_day' } });
    const chartId = profile.charts[0].id, detail = getBaziReadingDetail(chartId), review = detail.facts.monthCommandReview!;
    if (item.legacy) {
      const facts: BaziReadingFacts = { ...detail.facts, methodologyVersion: 'bazi-reading-v4-method-premise-review', monthCommandReview: undefined, evidence: detail.facts.evidence.filter(evidence => !evidence.id.includes(':month-command:')) };
      const claim = claimBaziReading({ chartId, facts, regenerate: false, provider: 'synthetic', model: '旧方法复核合成', promptVersion: 'bazi-reading-report-v4-method-premises' });
      finishBaziReading(claim.version.id, claim.requestId!, { summary: '旧版分方法论命合成报告，验证新司事复核上线后不补写旧报告事实。', sections: Object.keys(BAZI_READING_SECTIONS).map(key => ({ key: key as keyof typeof BAZI_READING_SECTIONS, content: `${key}旧方法合成解释，只使用生成时保存的事实；这份版本没有保存人元司事分日层。`, evidenceIds: [key === 'action' ? 'chart:policy' : facts.evidence.find(evidence => evidence.id.startsWith(`${key}:`))!.id] })) }, 1, 1);
    }
    return { key: item.key, label: item.label, chartId, url: `http://127.0.0.1:30002/bazi/reading/${chartId}`, status: review.status, candidateCount: review.candidateSegmentIds.length, activeText: review.segments.find(segment => segment.id === review.activeSegmentId)?.sourceText ?? null };
  }));
  writeFileSync(path.join(directory, 'bazi-month-command-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'bazi-month-command-manifest.json'), JSON.stringify({ username, cases }, null, 2));
  runAsUser(user, closeDatabaseConnection); closeAccountConnections();
  console.log(JSON.stringify({ directory, username, cases }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
