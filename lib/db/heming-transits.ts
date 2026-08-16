import { randomUUID } from 'node:crypto';
import type {
  HemingAnnualTransitSnapshot,
  HemingTransitSnapshotRecord,
} from '@/lib/heming/transit-types';
import { getDatabase } from './client';

interface HemingTransitRow {
  id: string;
  conversation_id: string;
  selected_year: number;
  chart_engine_version: string;
  transit_engine_version: string;
  methodology_version: string;
  snapshot_json: string;
  created_at: number;
  updated_at: number;
}

function mapRow(row: HemingTransitRow): HemingTransitSnapshotRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    selectedYear: row.selected_year,
    chartEngineVersion: row.chart_engine_version,
    transitEngineVersion: row.transit_engine_version,
    methodologyVersion: row.methodology_version,
    snapshot: JSON.parse(row.snapshot_json) as HemingAnnualTransitSnapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getHemingTransitSnapshot(input: {
  conversationId: string;
  selectedYear: number;
  chartEngineVersion: string;
  transitEngineVersion: string;
  methodologyVersion: string;
}): HemingTransitSnapshotRecord | null {
  const row = getDatabase().prepare(`
    SELECT * FROM heming_transit_snapshots
    WHERE conversation_id = ? AND selected_year = ?
      AND chart_engine_version = ? AND transit_engine_version = ?
      AND methodology_version = ?
  `).get(
    input.conversationId,
    input.selectedYear,
    input.chartEngineVersion,
    input.transitEngineVersion,
    input.methodologyVersion,
  ) as HemingTransitRow | undefined;
  return row ? mapRow(row) : null;
}

export function upsertHemingTransitSnapshot(input: {
  conversationId: string;
  selectedYear: number;
  chartEngineVersion: string;
  transitEngineVersion: string;
  methodologyVersion: string;
  snapshot: HemingAnnualTransitSnapshot;
}): HemingTransitSnapshotRecord {
  const existing = getHemingTransitSnapshot(input);
  const id = existing?.id ?? randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO heming_transit_snapshots (
      id, conversation_id, selected_year, chart_engine_version,
      transit_engine_version, methodology_version, snapshot_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (
      conversation_id, selected_year, chart_engine_version,
      transit_engine_version, methodology_version
    ) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at
  `).run(
    id,
    input.conversationId,
    input.selectedYear,
    input.chartEngineVersion,
    input.transitEngineVersion,
    input.methodologyVersion,
    JSON.stringify(input.snapshot),
    existing?.createdAt ?? now,
    now,
  );
  return getHemingTransitSnapshot(input)!;
}

export function listHemingTransitSnapshots(conversationId: string): HemingTransitSnapshotRecord[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM heming_transit_snapshots
    WHERE conversation_id = ? ORDER BY selected_year DESC
  `).all(conversationId) as HemingTransitRow[];
  return rows.map(mapRow);
}
