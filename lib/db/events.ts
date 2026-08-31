import { randomUUID } from 'node:crypto';
import type {
  EventTransitLink,
  LifeEvent,
  LifeEventCategory,
  LifeEventDatePrecision,
  LifeEventInput,
  LifeEventSource,
  LifeEventWithTransits,
} from '@/lib/events/types';
import type { TransitLevel, TransitSnapshot } from '@/lib/transits/types';
import { getDatabase } from './client';

interface LifeEventRow {
  id: string;
  conversation_id: string;
  title: string;
  category: LifeEventCategory;
  custom_category: string | null;
  start_date: string;
  end_date: string | null;
  date_precision: LifeEventDatePrecision;
  description: string | null;
  impact_level: 1 | 2 | 3 | 4 | 5;
  source: LifeEventSource;
  source_message_id: string | null;
  confirmed_by_user: number;
  created_at: number;
  updated_at: number;
}

interface EventTransitLinkRow {
  id: string;
  event_id: string;
  snapshot_id: string;
  level: TransitLevel;
  target_date: string;
  relationship: EventTransitLink['relationship'];
  snapshot_json: string;
  created_at: number;
}

function mapEvent(row: LifeEventRow): LifeEvent {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    category: row.category,
    customCategory: row.custom_category,
    startDate: row.start_date,
    endDate: row.end_date,
    datePrecision: row.date_precision,
    description: row.description,
    impactLevel: row.impact_level,
    source: row.source,
    sourceMessageId: row.source_message_id,
    confirmedByUser: Boolean(row.confirmed_by_user),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLink(row: EventTransitLinkRow): EventTransitLink {
  const snapshot = JSON.parse(row.snapshot_json) as TransitSnapshot;
  const base = {
    id: row.id,
    eventId: row.event_id,
    snapshotId: row.snapshot_id,
    targetDate: row.target_date,
    relationship: row.relationship,
    createdAt: row.created_at,
  };
  if (snapshot.level !== row.level) throw new Error(`人生事件运限关联层级不一致：${row.id}`);
  if (snapshot.level === 'year') return { ...base, level: 'year', snapshot };
  if (snapshot.level === 'month') return { ...base, level: 'month', snapshot };
  return { ...base, level: 'day', snapshot };
}

export function getLifeEvent(id: string): LifeEventWithTransits | null {
  const row = getDatabase().prepare('SELECT * FROM life_events WHERE id = ?').get(id) as LifeEventRow | undefined;
  if (!row) return null;
  return { ...mapEvent(row), transitLinks: listEventTransitLinks(id) };
}

export function listLifeEvents(input: {
  conversationId: string;
  category?: LifeEventCategory;
  year?: number;
}): LifeEventWithTransits[] {
  const clauses = ['conversation_id = ?'];
  const params: Array<string | number> = [input.conversationId];
  if (input.category) {
    clauses.push('category = ?');
    params.push(input.category);
  }
  if (input.year) {
    clauses.push(`(
      substr(start_date, 1, 4) = ?
      OR (date_precision = 'range' AND substr(start_date, 1, 4) <= ? AND substr(end_date, 1, 4) >= ?)
    )`);
    params.push(String(input.year), String(input.year), String(input.year));
  }
  const rows = getDatabase().prepare(`
    SELECT * FROM life_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY CASE WHEN start_date = '' THEN 1 ELSE 0 END, start_date ASC, created_at ASC
  `).all(...params) as LifeEventRow[];
  return rows.map(row => ({ ...mapEvent(row), transitLinks: listEventTransitLinks(row.id) }));
}

export function createLifeEvent(conversationId: string, input: LifeEventInput): LifeEventWithTransits {
  const id = randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO life_events (
      id, conversation_id, title, category, custom_category,
      start_date, end_date, date_precision, description, impact_level,
      source, source_message_id, confirmed_by_user, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    conversationId,
    input.title,
    input.category,
    input.customCategory ?? null,
    input.startDate,
    input.endDate ?? null,
    input.datePrecision,
    input.description ?? null,
    input.impactLevel,
    input.source ?? 'user_input',
    input.sourceMessageId ?? null,
    input.confirmedByUser === false ? 0 : 1,
    now,
    now,
  );
  return getLifeEvent(id)!;
}

export function updateLifeEvent(id: string, input: LifeEventInput): LifeEventWithTransits | null {
  if (!getLifeEvent(id)) return null;
  getDatabase().prepare(`
    UPDATE life_events SET
      title = ?, category = ?, custom_category = ?, start_date = ?, end_date = ?,
      date_precision = ?, description = ?, impact_level = ?, source = ?,
      source_message_id = ?, confirmed_by_user = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.title,
    input.category,
    input.customCategory ?? null,
    input.startDate,
    input.endDate ?? null,
    input.datePrecision,
    input.description ?? null,
    input.impactLevel,
    input.source ?? 'user_input',
    input.sourceMessageId ?? null,
    input.confirmedByUser === false ? 0 : 1,
    Date.now(),
    id,
  );
  return getLifeEvent(id);
}

export function deleteLifeEvent(id: string): boolean {
  return getDatabase().prepare('DELETE FROM life_events WHERE id = ?').run(id).changes > 0;
}

export function replaceEventTransitLinks(input: {
  eventId: string;
  links: Array<{
    snapshotId: string;
    level: TransitLevel;
    targetDate: string;
    relationship: EventTransitLink['relationship'];
  }>;
}): EventTransitLink[] {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare('DELETE FROM event_transit_links WHERE event_id = ?').run(input.eventId);
    const insert = db.prepare(`
      INSERT INTO event_transit_links (
        id, event_id, snapshot_id, level, target_date, relationship, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    input.links.forEach(link => insert.run(
      randomUUID(),
      input.eventId,
      link.snapshotId,
      link.level,
      link.targetDate,
      link.relationship,
      now,
    ));
  })();
  return listEventTransitLinks(input.eventId);
}

export function listEventTransitLinks(eventId: string): EventTransitLink[] {
  const rows = getDatabase().prepare(`
    SELECT l.*, s.snapshot_json
    FROM event_transit_links l
    JOIN transit_snapshots s ON s.id = l.snapshot_id
    WHERE l.event_id = ?
    ORDER BY CASE l.level WHEN 'year' THEN 0 WHEN 'month' THEN 1 ELSE 2 END, l.target_date ASC
  `).all(eventId) as EventTransitLinkRow[];
  return rows.map(mapLink);
}
