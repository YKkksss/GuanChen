import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createMeihuaSession } from '../lib/db/meihua';
import { LEGACY_MEIHUA_READING_VERSION } from '../lib/meihua/reading-types';
import type { MeihuaInput } from '../lib/meihua/types';

// 只在明确的系统临时验收目录创建合成资料。
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
async function main() {
  const username = `meihua-symbols-${randomUUID().slice(0, 8)}`, password = `${randomUUID()}!Qa`;
  const user = await registerUser({ username, password, displayName: '梅花取象合成验收' });
  const input: MeihuaInput = { method: 'manual', upper: 1, lower: 5, movingLine: 4, mutualPolicy: 'pure_changed', contextDateTime: '2026-10-16T12:00:00', seasonPolicy: 'jie_month', timingTarget: 'body' };
  const plans = runAsUser(user, () => {
    const add = (title: string, selected: MeihuaInput) => createMeihuaSession({ title, question: '合成验收：核对类象候选与同源爻位，不认定现实事件。', input: selected }).session;
    const current = add('普通互卦与固定体', input);
    const pure = add('纯乾取变卦中爻', { ...input, upper: 1, lower: 1, movingLine: 3 });
    const middle = add('纯乾统一取本卦中爻', { ...input, upper: 1, lower: 1, movingLine: 3, mutualPolicy: 'middle_lines' });
    const first = add('初爻动不进入互卦', { ...input, upper: 8, lower: 8, movingLine: 1 });
    const sixth = add('上爻动不进入互卦', { ...input, upper: 8, lower: 8, movingLine: 6 });
    const noTime = add('未提供时间不补季节', { ...input, upper: 3, lower: 6, movingLine: 2, contextDateTime: undefined });
    const objects = add('物数起卦取象', { method: 'objects', objectCount: '10', dateTime: '2026-10-16T12:00:00', mutualPolicy: 'pure_changed' });
    const season = add('旧季节快照不补取象', input);
    season.result.reading!.version = LEGACY_MEIHUA_READING_VERSION;
    delete season.result.reading!.imagery;
    season.result.evidence = season.result.evidence.filter(item => !item.id.startsWith('reading:imagery:'));
    const base = add('基础旧卦不补深化', input);
    delete base.result.reading;
    base.result.evidence = base.result.evidence.filter(item => !item.id.startsWith('reading:'));
    for (const legacy of [season, base]) getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(JSON.stringify(legacy.result), legacy.id);
    return Object.fromEntries(Object.entries({ current, pure, middle, first, sixth, noTime, objects, season, base }).map(([key, value]) => [key, value.id]));
  });
  writeFileSync(path.join(directory, 'meihua-imagery-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'meihua-imagery-manifest.json'), JSON.stringify({ username, plans, input }, null, 2));
  runAsUser(user, closeDatabaseConnection); closeAccountConnections();
  console.log(JSON.stringify({ directory, username, plans }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
