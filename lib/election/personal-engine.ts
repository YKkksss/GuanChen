import { ElectionError } from './error';
import { PERSONAL_BRANCH_CLASHES, PERSONAL_BRANCH_COMBINES, PERSONAL_STEM_COMBINES, PERSONAL_STEM_ELEMENTS, PERSONAL_THREE_HARMONIES } from './personal-rules';
import type { PersonalElectionAssessment, PersonalElectionRelation, PersonalElectionSnapshot } from './personal-types';
function pair(table: string[], a: string, b: string) { return a !== b && table.some(p => p.includes(a) && p.includes(b)); }

/** 仅描述外来日或时与原局的关系，不合并双方原局，不把存在关系等同成化或吉凶。 */
export function assessPersonalElection(snapshot: PersonalElectionSnapshot, ganZhi: string, scope: 'day'|'hour'): PersonalElectionAssessment {
  if (typeof ganZhi !== 'string' || ganZhi.length !== 2 || !PERSONAL_STEM_ELEMENTS[ganZhi[0]] || !'子丑寅卯辰巳午未申酉戌亥'.includes(ganZhi[1])) throw new ElectionError('用事干支不正确');
  const [stem,branch] = ganZhi, label = scope === 'day' ? '用事日' : '用事时', element = PERSONAL_STEM_ELEMENTS[stem], input = snapshot.input;
  const participants = snapshot.participants.map(p => {
    const relations: PersonalElectionRelation[] = [], excludedReasons: string[] = [];
    for (const pillar of p.pillars) {
      const prefix = `${label}${ganZhi}与${pillar.label}${pillar.stem}${pillar.branch}`;
      if (pair(PERSONAL_STEM_COMBINES,stem,pillar.stem)) relations.push({type:'stem_combine',label:`${pillar.label}天干五合`,detail:`${prefix}存在天干五合位置；未判合化或吉凶。`,pillarKeys:[pillar.key]});
      const clash = pair(PERSONAL_BRANCH_CLASHES,branch,pillar.branch);
      if (clash) {
        relations.push({type:'branch_clash',label:`${pillar.label}地支六冲`,detail:`${prefix}地支相冲；是否排除只按已勾选的年支、日支规则。`,pillarKeys:[pillar.key]});
        const blocked = scope === 'day' ? (pillar.key === 'year' && input.avoidDayYearClash) || (pillar.key === 'day' && input.avoidDayBranchClash) : (pillar.key === 'year' && input.avoidHourYearClash) || (pillar.key === 'day' && input.avoidHourBranchClash);
        if (blocked) excludedReasons.push(`${label}支${branch}冲${pillar.label}支${pillar.branch}，命中已勾选的避冲条件。`);
      }
      if (pair(PERSONAL_BRANCH_COMBINES,branch,pillar.branch)) relations.push({type:'branch_combine',label:`${pillar.label}地支六合`,detail:`${prefix}存在六合位置；未判合化，不抵消其他冲或事项忌。`,pillarKeys:[pillar.key]});
      if (branch === pillar.branch) relations.push({type:'branch_repeat',label:`${pillar.label}同支`,detail:`${prefix}地支相同；不单凭同支判伏吟或吉凶。`,pillarKeys:[pillar.key]});
    }
    for (const group of PERSONAL_THREE_HARMONIES.filter(g => g.includes(branch))) {
      // 必须由用事支加原局的另外两种支凑齐；重复同支不补足缺位。
      const others = [...group].filter(b => b !== branch);
      if (others.every(b => p.pillars.some(x => x.branch === b))) {
        const members = p.pillars.filter(x => others.includes(x.branch));
        relations.push({type:'three_harmony',label:`${group}三合齐支`,detail:`${label}支${branch}与${members.map(x => `${x.label}${x.branch}`).join('、')}补齐${group}三种支；仅记录齐支，不判成局、合化或择日吉凶。`,pillarKeys:members.map(x => x.key)});
      }
    }
    const hasManual = p.preferredElements.length > 0 || p.cautiousElements.length > 0;
    if (input.filterStems && hasManual) {
      if (p.preferredElements.length && !p.preferredElements.includes(element)) excludedReasons.push(`${label}干${stem}属${element}，未在人工偏好${p.preferredElements.join('、')}中。`);
      if (p.cautiousElements.includes(element)) excludedReasons.push(`${label}干${stem}属${element}，命中人工谨慎五行。`);
    }
    const manualElementNote = hasManual ? `${label}干${stem}属${element}；人工偏好：${p.preferredElements.join('、') || '未设置'}；人工谨慎：${p.cautiousElements.join('、') || '未设置'}。${input.filterStems ? '已启用显式过滤' : '仅展示，不参与排除'}；依据：${p.basisNote}。此处只看天干五行，不代表整日或整时的整体五行。` : `未填写人工五行；${label}干${stem}属${element}仅作事实展示，未自动使用调候候选。`;
    return {chartId:p.chartId,displayName:p.displayName,unknownTime:p.unknownTime,relations,excludedReasons,manualElementNote};
  });
  const reasons = participants.flatMap(p => p.excludedReasons.map(r => `${p.displayName}：${r}`));
  return {scope,targetGanZhi:ganZhi,participants,excluded:reasons.length > 0,reasons};
}
