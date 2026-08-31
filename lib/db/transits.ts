import { randomUUID } from 'node:crypto';
import type { TransitLevel, TransitSnapshot, TransitSnapshotRecord } from '@/lib/transits/types';
import { getDatabase } from './client';

interface TransitSnapshotRow {
  id: string;
  conversation_id: string;
  level: TransitLevel;
  target_date: string;
  engine_version: string;
  snapshot_json: string;
  created_at: number;
  updated_at: number;
}

function mapRow<TSnapshot extends TransitSnapshot = TransitSnapshot>(row: TransitSnapshotRow): TransitSnapshotRecord<TSnapshot> {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    level: row.level,
    targetDate: row.target_date,
    engineVersion: row.engine_version,
    snapshot: JSON.parse(row.snapshot_json) as TSnapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTransitSnapshot<TSnapshot extends TransitSnapshot = TransitSnapshot>(input: {
  conversationId: string;
  level: TransitLevel;
  targetDate: string;
  engineVersion: string;
}): TransitSnapshotRecord<TSnapshot> | null {
  const row = getDatabase().prepare(`
    SELECT * FROM transit_snapshots
    WHERE conversation_id = ? AND level = ? AND target_date = ? AND engine_version = ?
  `).get(
    input.conversationId,
    input.level,
    input.targetDate,
    input.engineVersion,
  ) as TransitSnapshotRow | undefined;
  return row ? mapRow<TSnapshot>(row) : null;
}

export function getTransitSnapshotById(id: string): TransitSnapshotRecord | null {
  const row = getDatabase().prepare('SELECT * FROM transit_snapshots WHERE id = ?')
    .get(id) as TransitSnapshotRow | undefined;
  return row ? mapRow(row) : null;
}

export function upsertTransitSnapshot<TSnapshot extends TransitSnapshot>(input: {
  conversationId: string;
  level: TransitLevel;
  targetDate: string;
  engineVersion: string;
  snapshot: TSnapshot;
}): TransitSnapshotRecord<TSnapshot> {
  const existing = getTransitSnapshot<TSnapshot>(input);
  const id = existing?.id ?? randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO transit_snapshots (
      id, conversation_id, level, target_date, engine_version,
      snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, level, target_date, engine_version)
    DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at
  `).run(
    id,
    input.conversationId,
    input.level,
    input.targetDate,
    input.engineVersion,
    JSON.stringify(input.snapshot),
    existing?.createdAt ?? now,
    now,
  );
  return getTransitSnapshot<TSnapshot>(input)!;
}

export function listTransitSnapshots(conversationId: string): TransitSnapshotRecord[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM transit_snapshots WHERE conversation_id = ? ORDER BY target_date DESC
  `).all(conversationId) as TransitSnapshotRow[];
  return rows.map(mapRow);
}
