import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createLiuyaoSession } from '../lib/db/liuyao';
import { calculateLiuyao } from '../lib/liuyao/engine';
import { LEGACY_LIUYAO_READING_VERSION } from '../lib/liuyao/reading-types';
import { KINDS, type LiuyaoInput, type LiuyaoResult } from '../lib/liuyao/types';

// 仅向指定的临时验收库写合成占问，不连接日常数据目录。
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许系统临时目录下的隔离验收环境');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
const username = `influence-qa-${randomUUID().slice(0, 8)}`;
const password = `${randomUUID()}!Qa`;

function findInput(predicate: (result: LiuyaoResult) => boolean): LiuyaoInput {
  for (let bits = 0; bits < 64; bits++) {
    for (const kind of KINDS) {
      const input: LiuyaoInput = { method: 'lines', dateTime: '2026-10-16T12:00:00', lateZiPolicy: 'midnight', focusKind: kind, focusTarget: 'manual', lineValues: Array.from({ length: 6 }, (_, index) => bits & (1 << index) ? 9 : 6) };
      if (predicate(calculateLiuyao(input))) return input;
    }
  }
  throw new Error('未找到要求的合成验收结构');
}

async function main() {
  const user = await registerUser({ username, password, displayName: '六爻作用链合成验收' });
  const inputs = {
    multiple: findInput(result => result.reading!.focus.status === 'multiple' && result.reading!.influence!.jointActions.length > 0),
    joint: findInput(result => result.reading!.influence!.jointActions.some(item => item.kind === 'ji_yuan') && result.reading!.influence!.jointActions.some(item => item.kind === 'chou_ji')),
    hidden: findInput(result => result.reading!.focus.candidates.some(item => item.hidden)),
  };
  const selected = { ...inputs.multiple, focusPosition: calculateLiuyao(inputs.multiple).reading!.focus.candidates[0].position };
  const plans = runAsUser(user, () => {
    const add = (title: string, input: LiuyaoInput) => createLiuyaoSession({ title, question: '合成验收：核对项目安排中的来源与制约，不作现实预测。', notes: '仅为本机临时验收资料。', input }).session;
    const multiple = add('多现候选与作用路径', inputs.multiple);
    const joint = add('两类共同发动并列', inputs.joint);
    const hidden = add('伏神与飞爻分别复核', inputs.hidden);
    const chosen = add('手选用神与来源制约', selected);
    const none = add('尚未指定用神对象', { ...inputs.multiple, focusKind: 'none' });
    const v1 = add('旧条件快照不补作用链', inputs.multiple);
    v1.result.reading!.version = LEGACY_LIUYAO_READING_VERSION;
    v1.result.reading!.scope = '用神定位与月日动变条件复核，不包含完整效力、吉凶或精确应期裁决。';
    delete v1.result.reading!.influence;
    v1.result.evidence = v1.result.evidence.filter(item => !item.id.startsWith('reading:influence:'));
    const old = add('基础旧卦象不补深化', inputs.multiple);
    delete old.result.reading;
    old.result.evidence = old.result.evidence.filter(item => !item.id.startsWith('reading:'));
    for (const legacy of [v1, old]) getDatabase().prepare('UPDATE liuyao_sessions SET result_json=? WHERE id=?').run(JSON.stringify(legacy.result), legacy.id);
    return { multiple: multiple.id, joint: joint.id, hidden: hidden.id, selected: chosen.id, none: none.id, v1: v1.id, old: old.id };
  });
  writeFileSync(path.join(directory, 'liuyao-influence-login.json'), JSON.stringify({ username, password }));
  writeFileSync(path.join(directory, 'liuyao-influence-manifest.json'), JSON.stringify({ username, plans, inputs: { ...inputs, selected } }, null, 2));
  runAsUser(user, closeDatabaseConnection);
  closeAccountConnections();
  console.log(JSON.stringify({ directory, username, plans }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
