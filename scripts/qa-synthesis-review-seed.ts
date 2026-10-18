import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection } from '../lib/db/client';
import { createSynthesisSession, storeSynthesisSnapshot } from '../lib/db/synthesis';
import { getSynthesisDetail } from '../lib/synthesis/service';
import { buildDynamicSynthesisFacts } from '../lib/synthesis/dynamic-engine';
import { saveDynamicSynthesisSnapshot } from '../lib/synthesis/dynamic-service';
import { LEGACY_SYNTHESIS_DYNAMIC_VERSION } from '../lib/synthesis/dynamic-types';
import { SYNTHESIS_TOPICS, type SynthesisTopic } from '../lib/synthesis/types';

// 只使用全新临时账号库，不连接日常命盘与凭据。
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
const selection = { level: 'month' as const, dateTime: '2026-10-16T12:00:00' };
const input = { displayName: '动态主题复核合成甲', birthDate: '1992-07-09', birthTime: '09:30', gender: 'female', timeZoneId: 'Etc/GMT-8', timeStandard: 'civil_time', lateZiPolicy: 'next_day' };
async function main() {
  const username = `synthesis-review-${randomUUID().slice(0, 8)}`, password = `${randomUUID()}!Qa`;
  const user = await registerUser({ username, password, displayName: '动态主题复核合成验收' });
  const plans = runAsUser(user, () => {
    const current = createSynthesisSession(input).session;
    for (const topic of Object.keys(SYNTHESIS_TOPICS) as SynthesisTopic[]) saveDynamicSynthesisSnapshot(current.id, topic, selection);
    saveDynamicSynthesisSnapshot(current.id, 'overview', { ...selection, level: 'year' });
    const unknown = createSynthesisSession({ ...input, displayName: '未知时辰后日参考', unknownTime: true, birthTime: undefined }).session;
    saveDynamicSynthesisSnapshot(unknown.id, 'overview', selection);
    const birthUnknown = createSynthesisSession({ ...input, displayName: '出生当日未确认适用', unknownTime: true, birthTime: undefined }).session;
    saveDynamicSynthesisSnapshot(birthUnknown.id, 'overview', { level: 'month', dateTime: '1992-07-09T12:00:00' });
    const preLuck = createSynthesisSession({ ...input, displayName: '首运之前不补大运' }).session;
    saveDynamicSynthesisSnapshot(preLuck.id, 'overview', { level: 'year', dateTime: '1992-07-10T12:00:00' });
    const afterLuck = createSynthesisSession({ ...input, displayName: '八步之后不延伸大运' }).session;
    saveDynamicSynthesisSnapshot(afterLuck.id, 'overview', { level: 'month', dateTime: '2110-10-16T12:00:00' });
    const legacy = createSynthesisSession({ ...input, displayName: '旧动态快照不补主题复核' }).session;
    const facts = buildDynamicSynthesisFacts(getSynthesisDetail(legacy.id, 'overview').facts, selection);
    delete facts.dynamic.review;
    facts.dynamic.version = LEGACY_SYNTHESIS_DYNAMIC_VERSION;
    facts.dynamic.key = `${LEGACY_SYNTHESIS_DYNAMIC_VERSION}:${selection.level}:${selection.dateTime}`;
    facts.evidence = facts.evidence.filter(item => !item.id.includes(':dynamic:review:'));
    storeSynthesisSnapshot({ sessionId: legacy.id, facts });
    return { current: current.id, unknown: unknown.id, birthUnknown: birthUnknown.id, preLuck: preLuck.id, afterLuck: afterLuck.id, legacy: legacy.id, legacyKey: facts.dynamic.key };
  });
  writeFileSync(path.join(directory, 'synthesis-review-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'synthesis-review-manifest.json'), JSON.stringify({ username, plans, selection, input }, null, 2));
  runAsUser(user, closeDatabaseConnection); closeAccountConnections();
  console.log(JSON.stringify({ directory, username, plans }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
