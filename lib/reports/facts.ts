import { getCurrentStage } from '@/lib/ziwei/current-stage';
import { selectReportEvents } from './event-selection';
import type { LifeEventWithTransits } from '@/lib/events/types';
import type { ReportEvidenceDraft, ReportType } from './types';
import { REPORT_TYPE_DEFINITIONS } from './types';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import { detectPatterns } from '@/lib/ziwei/patterns';
import type { ZiweiChart } from '@/lib/ziwei/types';

export function buildReportEvidence(
  chart: ZiweiChart,
  type: ReportType,
  lifeEvents: LifeEventWithTransits[] = [],
  asOf: Date = new Date(),
): ReportEvidenceDraft[] {
  const definition = REPORT_TYPE_DEFINITIONS[type];
  const stage = getCurrentStage(chart, asOf);
  const { currentAge, currentDaXian } = stage;
  const eventSelection = selectReportEvents(lifeEvents, type, stage.period);
  const evidence: ReportEvidenceDraft[] = [
    {
      evidenceKey: 'chart:core',
      kind: 'chart_core',
      label: '本命核心结构',
      source: 'chart_snapshot',
      facts: {
        birthDate: `${chart.birthInfo.year}-${pad(chart.birthInfo.month)}-${pad(chart.birthInfo.day)}`,
        hourBranch: chart.birthInfo.unknownTime ? null : BRANCHES[chart.birthInfo.hour] ?? chart.birthInfo.hour,
        birthTimeConfidence: chart.birthInfo.unknownTime ? 'unknown' : 'known',
        gender: chart.birthInfo.gender,
        lunarDate: `${chart.lunarInfo.lunarYear}-${chart.lunarInfo.lunarMonth}-${chart.lunarInfo.lunarDay}`,
        birthYearGanZhi: `${STEMS[chart.lunarInfo.yearStem] ?? ''}${BRANCHES[chart.lunarInfo.yearBranch] ?? ''}`,
        mingGongBranch: BRANCHES[chart.mingGongBranch] ?? chart.mingGongBranch,
        shenGongBranch: BRANCHES[chart.shenGongBranch] ?? chart.shenGongBranch,
        wuxingJu: chart.wuxingJuName,
        currentAge,
        asOfDate: stage.asOfDate,
        ageConvention: stage.ageConvention,
        timeZone: stage.timeZone,
        stageStatus: currentDaXian ? '已定位当前大限' : '当前虚岁不在快照的大限范围内，不补造阶段',
        eventSelection: eventSelection.summary,
      },
    },
  ];

  for (const palaceName of definition.palaceNames) {
    const palace = chart.palaces.find(item => normalizePalaceName(item.name) === palaceName);
    if (!palace) continue;
    evidence.push({
      evidenceKey: `palace:${palaceName}:${palace.branch}`,
      kind: 'palace',
      label: `${palaceName}（${BRANCHES[palace.branch] ?? palace.branch}）`,
      source: 'chart_snapshot',
      facts: {
        palace: palaceName,
        branch: BRANCHES[palace.branch] ?? palace.branch,
        stem: STEMS[palace.stem] ?? palace.stem,
        stars: palace.stars.map(star => ({
          name: star.name,
          type: star.type,
          siHua: star.siHua ?? null,
          brightness: star.brightness ?? null,
        })),
        isMingGong: Boolean(palace.isMingGong),
        isShenGong: Boolean(palace.isShenGong),
        isEmpty: Boolean(palace.isEmpty),
        borrowedFrom: palace.borrowedFromName ?? null,
        borrowedStars: palace.borrowedStars ?? [],
        daXianAge: palace.daXianAge ?? null,
      },
    });
  }

  if (currentDaXian) {
    const palace = chart.palaces.find(item => item.branch === currentDaXian.palaceBranch);
    evidence.push({
      evidenceKey: `daxian:${currentDaXian.startAge}-${currentDaXian.endAge}`,
      kind: 'daxian',
      label: `当前大限 ${currentDaXian.startAge}-${currentDaXian.endAge} 岁`,
      source: 'chart_snapshot',
      facts: {
        asOfDate: stage.asOfDate,
        ageConvention: stage.ageConvention,
        period: stage.period,
        startAge: currentDaXian.startAge,
        endAge: currentDaXian.endAge,
        palaceName: normalizePalaceName(currentDaXian.palaceName),
        branch: BRANCHES[currentDaXian.palaceBranch] ?? currentDaXian.palaceBranch,
        stars: palace?.stars.map(star => ({
          name: star.name,
          type: star.type,
          siHua: star.siHua ?? null,
          brightness: star.brightness ?? null,
        })) ?? [],
      },
    });
  }

  const patterns = detectPatterns(chart).slice(0, 8);
  for (const pattern of patterns) {
    evidence.push({
      evidenceKey: `pattern:${pattern.name}`,
      kind: 'pattern',
      label: `格局：${pattern.name}`,
      source: 'rule_engine',
      facts: {
        name: pattern.name,
        level: pattern.level,
        description: pattern.description,
        palaces: pattern.palaces,
        conditions: pattern.conditions ?? null,
        source: pattern.source ?? null,
      },
    });
  }

  for (const event of eventSelection.selected) {
    evidence.push({
      evidenceKey: `event:${event.id}`,
      kind: 'confirmed_event',
      label: `用户确认事件：${event.title}`,
      source: 'user_confirmed',
      facts: {
        title: event.title,
        category: event.category,
        customCategory: event.customCategory,
        startDate: event.startDate,
        endDate: event.endDate,
        datePrecision: event.datePrecision,
        description: event.description,
        impactLevel: event.impactLevel,
      },
    });
  }

  return evidence;
}

function normalizePalaceName(name: string): string {
  return name.endsWith('宫') ? name : `${name}宫`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
