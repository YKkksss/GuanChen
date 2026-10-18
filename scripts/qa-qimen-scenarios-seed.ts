import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createQimenSession } from '../lib/db/qimen';
import { calculateQimen } from '../lib/qimen/engine';
import { LEGACY_QIMEN_READING_VERSION } from '../lib/qimen/reading-types';
import type { QimenScenarioKey } from '../lib/qimen/scenario-types';
import type { QimenInput, QimenResult } from '../lib/qimen/types';

// 只在明确的临时验收目录生成合成账号和盘面，不连接日常账号库。
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
function find(scenario: QimenScenarioKey, predicate: (result: QimenResult) => boolean): QimenInput {
  for (let day = 0; day < 30; day++) for (const dun of ['yang', 'yin'] as const) for (let ju = 1; ju <= 9; ju++) {
    const dateTime = new Date(Date.UTC(2026, 9, 16 + day, 12)).toISOString().slice(0, 19);
    const input: QimenInput = { method: 'manual', manualDun: dun, manualJu: ju, dateTime, lateZiPolicy: 'midnight', focusTarget: 'day_hour', scenario };
    if (predicate(calculateQimen(input))) return input;
  }
  throw new Error(`没有找到${scenario}要求的合成结构`);
}
async function main() {
  const inputs = {
    wealth: find('wealth', result => result.reading!.scenario!.roles.some(role => role.locations.length === 2)),
    study: find('study', result => result.reading!.scenario!.roles.some(role => role.locations.some(item => item.ownPatterns.length > 0))),
    travel: find('travel', result => result.chief.doorRawPalace === 5),
    jia: find('study', result => result.calendar.day[0] === '甲' && result.reading!.scenario!.roles.find(role => role.id === 'exam_day')?.stemFocus?.earthOrigin === 5),
    same: find('study', result => result.calendar.day[0] === '丁'),
  };
  const username = `qimen-scene-${randomUUID().slice(0, 8)}`, password = `${randomUUID()}!Qa`;
  const user = await registerUser({ username, password, displayName: '奇门占类合成验收' });
  const plans = runAsUser(user, () => {
    const add = (title: string, input: QimenInput) => createQimenSession({ title, question: '合成验收：核对占类角色和条件，不作现实预测。', notes: '本机临时资料。', input }).session;
    const wealth = add('求财双星与比较层级', inputs.wealth);
    const study = add('考试自身刑墓与宫内条件', inputs.study);
    const travel = add('水陆参照与值使寄宫', inputs.travel);
    const jia = add('甲日自身旬与原中五', inputs.jia);
    const same = add('丁日同宫双角色', inputs.same);
    const none = add('未指定占类保留旧参考', { ...inputs.study, scenario: 'none', focusTarget: 'manual_palace', focusPalace: 5 });
    const v1 = add('上一版条件快照不补占类', inputs.study);
    v1.result.reading!.version = LEGACY_QIMEN_READING_VERSION;
    v1.result.reading!.scope = '日时干定位与宫门星仪条件复核，不作完整占类取用、格局效力或精确应期裁决。';
    delete v1.result.reading!.scenario;
    delete v1.result.input.scenario;
    v1.result.evidence = v1.result.evidence.filter(item => !item.id.startsWith('reading:scenario:'));
    const old = add('基础旧盘不补深化', inputs.study);
    delete old.result.reading;
    delete old.result.input.scenario;
    old.result.evidence = old.result.evidence.filter(item => !item.id.startsWith('reading:'));
    for (const legacy of [v1, old]) getDatabase().prepare('UPDATE qimen_sessions SET result_json=? WHERE id=?').run(JSON.stringify(legacy.result), legacy.id);
    return { wealth: wealth.id, study: study.id, travel: travel.id, jia: jia.id, same: same.id, none: none.id, v1: v1.id, old: old.id };
  });
  writeFileSync(path.join(directory, 'qimen-scenarios-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'qimen-scenarios-manifest.json'), JSON.stringify({ username, plans, inputs }, null, 2));
  runAsUser(user, closeDatabaseConnection); closeAccountConnections();
  console.log(JSON.stringify({ directory, username, plans }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
