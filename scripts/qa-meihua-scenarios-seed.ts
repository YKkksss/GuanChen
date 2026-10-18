import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createMeihuaSession } from '../lib/db/meihua';
import { LEGACY_MEIHUA_READING_VERSION, LEGACY_MEIHUA_IMAGERY_READING_VERSION } from '../lib/meihua/reading-types';
import type { MeihuaInput } from '../lib/meihua/types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
async function main() {
  const username = `meihua-scenes-${randomUUID().slice(0, 8)}`, password = `${randomUUID()}!Qa`;
  const user = await registerUser({ username, password, displayName: '梅花占类合成验收' });
  const input: MeihuaInput = { method: 'manual', upper: 1, lower: 5, movingLine: 4, mutualPolicy: 'pure_changed', contextDateTime: '2026-10-17T12:00:00', scenario: 'planning' };
  const plans = runAsUser(user, () => {
    const add = (title: string, selected: MeihuaInput) => createMeihuaSession({ title, question: '合成验收：求财与出行字样不能替代明确占类选择，不认定现实事件。', input: selected }).session;
    const current = add('求谋与相反辅助条件', input);
    const wealth = add('求财制财与耗泄核对', { ...input, scenario: 'wealth' });
    const travel = add('出行条件与行人区别', { ...input, scenario: 'travel' });
    const none = add('未指定不猜占类', { ...input, scenario: 'none' });
    const noTime = add('无时间求谋不补季节', { ...input, contextDateTime: undefined });
    const pure = add('纯乾取变卦中爻求财', { ...input, upper: 1, lower: 1, movingLine: 3, scenario: 'wealth' });
    const imagery = add('旧取象不补占类', input);
    imagery.result.reading!.version = LEGACY_MEIHUA_IMAGERY_READING_VERSION;
    delete imagery.result.reading!.scenario;
    delete imagery.result.input.scenario;
    imagery.result.evidence = imagery.result.evidence.filter(item => !item.id.startsWith('reading:scenario:'));
    const season = add('旧季节不补取象占类', input);
    season.result.reading!.version = LEGACY_MEIHUA_READING_VERSION;
    delete season.result.reading!.imagery; delete season.result.reading!.scenario; delete season.result.input.scenario;
    season.result.evidence = season.result.evidence.filter(item => !item.id.startsWith('reading:imagery:') && !item.id.startsWith('reading:scenario:'));
    const base = add('基础旧卦不补深化', input);
    delete base.result.reading; delete base.result.input.scenario;
    base.result.evidence = base.result.evidence.filter(item => !item.id.startsWith('reading:'));
    for (const legacy of [imagery, season, base]) getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(JSON.stringify(legacy.result), legacy.id);
    return Object.fromEntries(Object.entries({ current, wealth, travel, none, noTime, pure, imagery, season, base }).map(([key, value]) => [key, value.id]));
  });
  writeFileSync(path.join(directory, 'meihua-scenarios-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'meihua-scenarios-manifest.json'), JSON.stringify({ username, plans, input }, null, 2));
  runAsUser(user, closeDatabaseConnection); closeAccountConnections();
  console.log(JSON.stringify({ directory, username, plans }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
