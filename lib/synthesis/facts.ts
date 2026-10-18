import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import { SYNTHESIS_TOPICS, type SynthesisFacts, type SynthesisPolicy, type SynthesisTopic } from './types';
import type { ZiweiChart } from '@/lib/ziwei/types';
import type { BaziReadingFacts } from '@/lib/bazi/reading-types';
export function buildSynthesisFacts(topic: SynthesisTopic, policy: SynthesisPolicy, ziwei: ZiweiChart, bazi: BaziReadingFacts): SynthesisFacts {
  const evidence: SynthesisFacts['evidence'] = [
    { id: 'policy:shared', label: '共同出生与时间口径', details: `${policy.timezoneLabel}；${policy.timeStandard === 'civil_time' ? '民用标准时' : '统一太阳时'}；有效日期 ${policy.effectiveDate}，时刻 ${policy.effectiveTime}；紫微使用 ${policy.ziweiDate} ${policy.ziweiTimeLabel}。${policy.warnings.join('；')}`, system: 'shared' },
    { id: 'ziwei:structure', label: '紫微本命结构', details: `命宫在${BRANCHES[ziwei.mingGongBranch]}、身宫在${BRANCHES[ziwei.shenGongBranch]}；${ziwei.wuxingJuName}；农历出生年 ${ziwei.lunarInfo.lunarYear} ${STEMS[ziwei.lunarInfo.yearStem]}${BRANCHES[ziwei.lunarInfo.yearBranch]}。五行局不能等同八字日主或用神。`, system: 'ziwei' },
  ];
  for (const p of ziwei.palaces) evidence.push({ id: `ziwei:palace:${p.branch}`, label: `本命${p.name}`, details: `${BRANCHES[p.branch]}宫：${p.stars.map(s => `${s.name}${s.siHua ? `化${s.siHua}` : ''}`).join('、') || '无记录星曜'}${p.isEmpty ? `；空宫借${p.borrowedFromName ?? '对宫'}：${p.borrowedStars?.join('、') || '未记录'}` : ''}。`, system: 'ziwei' });
  for (const name of SYNTHESIS_TOPICS[topic].palaces) {
    const p = ziwei.palaces.find(p => p.name.replace(/宫$/, '') === name.replace(/宫$/, ''));
    if (!p) continue;
    const related = [p.branch, (p.branch + 6) % 12, (p.branch + 4) % 12, (p.branch + 8) % 12];
    evidence.push({ id: `ziwei:topic:${name}`, label: `${SYNTHESIS_TOPICS[topic].label} · ${name}三方四正`, details: related.map(branch => `本命${ziwei.palaces.find(p => p.branch === branch)?.name ?? '未定位'}（${BRANCHES[branch]}）`).join('、') + '。星曜依据分别查看上述本命宫。', system: 'ziwei' });
  }
  bazi.evidence.forEach(e => evidence.push({ ...e, id: `bazi:${e.id}`, system: 'bazi' }));
  const pillars = Object.values(bazi.chart.pillars).filter(p => p !== null);
  evidence.push({ id: 'bazi:topic', label: `${SYNTHESIS_TOPICS[topic].label} · 十神位置观察`, details: pillars.map(p => `${p!.label}${p!.ganZhi}：表层${p!.key === 'day' ? '日主参照' : p!.stemTenGod}；藏干${p!.hiddenStems.filter(s => (SYNTHESIS_TOPICS[topic].roles as readonly string[]).includes(s.tenGod)).map(s => `${s.stem}${s.tenGod}`).join('、') || '未见当前开放角色'}`).join('；') + '。角色位置不能直接映射现实人物、财富规模或必然事件。', system: 'bazi' });
  return { topic, policy, ziwei, bazi, evidence };
}
