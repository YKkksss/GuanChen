import { randomUUID } from 'node:crypto';
import type {
  AnonymousCaseChartSnapshot,
  CaseConsentScope,
  CaseEventSnapshot,
  CaseFacetType,
  CaseRecord,
  CaseSearchFacet,
  CaseSearchFilters,
  CaseSearchItem,
  CaseSearchOption,
  CaseSearchOptions,
  CaseSearchResponse,
  CaseStatus,
} from '@/lib/cases/types';
import { LIFE_EVENT_CATEGORY_LABELS, type LifeEventCategory } from '@/lib/events/types';
import { detectPatterns } from '@/lib/ziwei/patterns';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { getDatabase } from './client';

export const CASE_SEARCH_INDEX_VERSION = 1;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

interface SearchCaseRow {
  id: string;
  case_code: string;
  title: string;
  status: CaseStatus;
  confidence: CaseRecord['confidence'];
  chart_snapshot_json: string;
  created_at: number;
  updated_at: number;
  event_count: number;
  active_scopes_json: string;
}

interface FacetRow {
  case_id: string;
  facet_type: CaseFacetType;
  facet_value: string;
  facet_label: string;
}

export function ensureCaseSearchIndex(): number {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, chart_snapshot_json
    FROM case_records
    WHERE search_index_version < ?
  `).all(CASE_SEARCH_INDEX_VERSION) as Array<{ id: string; chart_snapshot_json: string }>;
  if (!rows.length) return 0;

  db.transaction(() => {
    rows.forEach(row => rebuildCaseSearchIndex(row.id, JSON.parse(row.chart_snapshot_json) as AnonymousCaseChartSnapshot));
  })();
  return rows.length;
}

export function rebuildCaseSearchIndex(caseId: string, snapshot?: AnonymousCaseChartSnapshot): CaseSearchFacet[] {
  const db = getDatabase();
  const chartSnapshot = snapshot ?? JSON.parse((db.prepare(`
    SELECT chart_snapshot_json FROM case_records WHERE id = ?
  `).get(caseId) as { chart_snapshot_json: string }).chart_snapshot_json) as AnonymousCaseChartSnapshot;
  const events = db.prepare(`
    SELECT category FROM case_event_snapshots WHERE case_id = ?
  `).all(caseId) as Array<{ category: LifeEventCategory }>;
  const facets = deriveCaseSearchFacets(chartSnapshot, events.map(event => event.category));
  const now = Date.now();

  db.prepare('DELETE FROM case_search_facets WHERE case_id = ?').run(caseId);
  const insert = db.prepare(`
    INSERT INTO case_search_facets (
      id, case_id, facet_type, facet_value, facet_label, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  facets.forEach(facet => insert.run(
    randomUUID(), caseId, facet.type, facet.value, facet.label, now,
  ));
  db.prepare(`
    UPDATE case_records SET search_index_version = ? WHERE id = ?
  `).run(CASE_SEARCH_INDEX_VERSION, caseId);
  return facets;
}

export function searchTeachingCases(filters: CaseSearchFilters = {}): CaseSearchResponse {
  ensureCaseSearchIndex();
  const { clauses, params } = buildSearchConditions(filters);
  const where = `WHERE ${clauses.join(' AND ')}`;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM case_event_snapshots e WHERE e.case_id = r.id) AS event_count,
      COALESCE((
        SELECT json_group_array(scope)
        FROM case_consents c
        WHERE c.case_id = r.id AND c.status = 'active'
      ), '[]') AS active_scopes_json
    FROM case_records r
    ${where}
    ORDER BY
      CASE r.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      r.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as SearchCaseRow[];
  const count = db.prepare(`
    SELECT COUNT(*) AS count FROM case_records r ${where}
  `).get(...params) as { count: number };
  const facetsByCase = listFacetsForCases(rows.map(row => row.id));

  return {
    cases: rows.map(row => mapSearchItem(row, facetsByCase.get(row.id) ?? [], filters)),
    total: count.count,
    options: listTeachingSearchOptions(),
    indexVersion: CASE_SEARCH_INDEX_VERSION,
  };
}

export function listTeachingSearchOptions(): CaseSearchOptions {
  ensureCaseSearchIndex();
  const rows = getDatabase().prepare(`
    SELECT f.facet_type, f.facet_value, f.facet_label, COUNT(DISTINCT f.case_id) AS count
    FROM case_search_facets f
    JOIN case_records r ON r.id = f.case_id
    WHERE r.status = 'reviewed'
      AND EXISTS (
        SELECT 1 FROM case_consents c
        WHERE c.case_id = r.id
          AND c.scope = 'teaching'
          AND c.status = 'active'
      )
    GROUP BY f.facet_type, f.facet_value, f.facet_label
    ORDER BY count DESC, f.facet_label ASC
  `).all() as Array<FacetRow & { count: number }>;

  const byType = new Map<CaseFacetType, CaseSearchOption[]>();
  rows.forEach(row => {
    const list = byType.get(row.facet_type) ?? [];
    list.push({ value: row.facet_value, label: row.facet_label, count: row.count });
    byType.set(row.facet_type, list);
  });
  return {
    mingBranches: byType.get('ming_branch') ?? [],
    majorStars: byType.get('ming_major_star') ?? [],
    sihua: byType.get('sihua') ?? [],
    patterns: byType.get('pattern') ?? [],
    wuxingJu: byType.get('wuxing_ju') ?? [],
    eventCategories: byType.get('event_category') ?? [],
  };
}

export function isTeachingCaseEligible(caseId: string): boolean {
  const row = getDatabase().prepare(`
    SELECT 1 FROM case_records r
    WHERE r.id = ? AND r.status = 'reviewed'
      AND EXISTS (
        SELECT 1 FROM case_consents c
        WHERE c.case_id = r.id
          AND c.scope = 'teaching'
          AND c.status = 'active'
      )
  `).get(caseId);
  return Boolean(row);
}

export function deriveCaseSearchFacets(
  snapshot: AnonymousCaseChartSnapshot,
  eventCategories: LifeEventCategory[],
): CaseSearchFacet[] {
  const facets: CaseSearchFacet[] = [];
  const add = (type: CaseFacetType, value: string, label = value) => {
    if (!facets.some(facet => facet.type === type && facet.value === value)) {
      facets.push({ type, value, label });
    }
  };
  add('ming_branch', String(snapshot.mingGongBranch), `${BRANCHES[snapshot.mingGongBranch]}宫`);
  add('wuxing_ju', snapshot.wuxingJuName);

  const ming = snapshot.palaces.find(palace => palace.branch === snapshot.mingGongBranch);
  const mingMajorStars = ming?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [];
  const effectiveMingStars = mingMajorStars.length ? mingMajorStars : ming?.borrowedStars ?? [];
  effectiveMingStars.forEach(star => add('ming_major_star', star));
  snapshot.palaces.flatMap(palace => palace.stars).forEach(star => {
    if (star.siHua) add('sihua', star.siHua, `化${star.siHua}`);
  });
  detectPatterns(toZiweiChart(snapshot)).forEach(pattern => add('pattern', pattern.name));
  eventCategories.forEach(category => add('event_category', category, LIFE_EVENT_CATEGORY_LABELS[category]));
  return facets;
}

export function toZiweiChart(snapshot: AnonymousCaseChartSnapshot): ZiweiChart {
  return {
    birthInfo: {
      year: 2000, month: 1, day: 1, hour: 0,
      gender: snapshot.profile.gender,
      unknownTime: snapshot.profile.birthTimeConfidence === 'unknown',
    },
    lunarInfo: {
      lunarYear: 2000, lunarMonth: 1, lunarDay: 1,
      yearStem: 0, yearBranch: 0, isLeapMonth: false,
    },
    mingGongBranch: snapshot.mingGongBranch,
    shenGongBranch: snapshot.shenGongBranch,
    wuxingJu: snapshot.wuxingJu,
    wuxingJuName: snapshot.wuxingJuName,
    ziweiPos: snapshot.ziweiPos,
    palaces: snapshot.palaces,
    daXians: snapshot.daXians,
    currentAge: 0,
    currentDaXianIndex: -1,
  };
}

function buildSearchConditions(filters: CaseSearchFilters) {
  const clauses = [
    "r.status = 'reviewed'",
    `EXISTS (
      SELECT 1 FROM case_consents teaching
      WHERE teaching.case_id = r.id
        AND teaching.scope = 'teaching'
        AND teaching.status = 'active'
    )`,
  ];
  const params: Array<string | number> = [];
  const addFacet = (type: CaseFacetType, value: string | number | undefined) => {
    if (value === undefined || value === '') return;
    clauses.push(`EXISTS (
      SELECT 1 FROM case_search_facets facet
      WHERE facet.case_id = r.id AND facet.facet_type = ? AND facet.facet_value = ?
    )`);
    params.push(type, String(value));
  };
  const query = filters.query?.trim().slice(0, 60);
  if (query) {
    clauses.push(`(
      r.title LIKE ? OR r.case_code LIKE ? OR EXISTS (
        SELECT 1 FROM case_search_facets query_facet
        WHERE query_facet.case_id = r.id AND query_facet.facet_label LIKE ?
      )
    )`);
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  addFacet('ming_branch', filters.mingBranch);
  addFacet('ming_major_star', filters.majorStar);
  addFacet('sihua', filters.sihua);
  addFacet('pattern', filters.pattern);
  addFacet('wuxing_ju', filters.wuxingJu);
  addFacet('event_category', filters.eventCategory);
  return { clauses, params };
}

function listFacetsForCases(caseIds: string[]): Map<string, CaseSearchFacet[]> {
  const result = new Map<string, CaseSearchFacet[]>();
  if (!caseIds.length) return result;
  const placeholders = caseIds.map(() => '?').join(',');
  const rows = getDatabase().prepare(`
    SELECT case_id, facet_type, facet_value, facet_label
    FROM case_search_facets
    WHERE case_id IN (${placeholders})
    ORDER BY facet_type, facet_label
  `).all(...caseIds) as FacetRow[];
  rows.forEach(row => {
    const list = result.get(row.case_id) ?? [];
    list.push({ type: row.facet_type, value: row.facet_value, label: row.facet_label });
    result.set(row.case_id, list);
  });
  return result;
}

function mapSearchItem(row: SearchCaseRow, facets: CaseSearchFacet[], filters: CaseSearchFilters): CaseSearchItem {
  const chart = JSON.parse(row.chart_snapshot_json) as AnonymousCaseChartSnapshot;
  const values = (type: CaseFacetType) => facets.filter(facet => facet.type === type).map(facet => facet.value);
  const labels = (type: CaseFacetType) => facets.filter(facet => facet.type === type).map(facet => facet.label);
  const matchReasons: string[] = [];
  if (filters.mingBranch !== undefined) matchReasons.push(`命宫位于${BRANCHES[filters.mingBranch]}宫`);
  if (filters.majorStar) matchReasons.push(`命宫主星包含${filters.majorStar}`);
  if (filters.sihua) matchReasons.push(`盘面包含化${filters.sihua}`);
  if (filters.pattern) matchReasons.push(`识别到${filters.pattern}`);
  if (filters.wuxingJu) matchReasons.push(filters.wuxingJu);
  if (filters.eventCategory) matchReasons.push(`包含${LIFE_EVENT_CATEGORY_LABELS[filters.eventCategory]}事件`);
  if (filters.query?.trim()) matchReasons.push(`匹配关键词“${filters.query.trim().slice(0, 24)}”`);
  return {
    id: row.id,
    caseCode: row.case_code,
    title: row.title,
    status: row.status,
    confidence: row.confidence,
    eventCount: row.event_count,
    activeScopes: JSON.parse(row.active_scopes_json) as CaseConsentScope[],
    wuxingJuName: chart.wuxingJuName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mingBranch: chart.mingGongBranch,
    mingMajorStars: values('ming_major_star'),
    patterns: values('pattern'),
    sihua: values('sihua'),
    eventCategories: values('event_category') as LifeEventCategory[],
    matchReasons: matchReasons.length ? matchReasons : labels('pattern').slice(0, 2),
  };
}
