import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var __ziweiSqlite: Database.Database | undefined;
}

function resolveDatabasePath(): string {
  const configuredPath = process.env.SQLITE_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }
  return path.resolve(process.cwd(), 'data', 'ziweidoushu.sqlite');
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all()
      .map(row => (row as { version: number }).version),
  );

  if (!applied.has(1)) {
    const applyV1 = db.transaction(() => {
      db.exec(`
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('chart', 'heming')),
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'archived')),

          birth_info_json TEXT,
          chart_snapshot_json TEXT,
          birth_info_a_json TEXT,
          birth_info_b_json TEXT,
          chart_snapshot_a_json TEXT,
          chart_snapshot_b_json TEXT,

          engine_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,

          summary_json TEXT,
          summary_through_seq INTEGER NOT NULL DEFAULT 0,
          summary_version INTEGER NOT NULL DEFAULT 1,
          summary_updated_at INTEGER,

          last_message_seq INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL DEFAULT '',

          source TEXT NOT NULL DEFAULT 'question',
          topic TEXT,
          palace_branch INTEGER,
          sihua_type TEXT,
          metadata_json TEXT,

          status TEXT NOT NULL DEFAULT 'completed'
            CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),

          token_count INTEGER NOT NULL DEFAULT 0,
          provider_message_id TEXT,
          provider_response_id TEXT,
          error_code TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, seq),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_conversations_updated_at
          ON conversations(status, updated_at DESC);
        CREATE INDEX idx_messages_conversation_seq
          ON messages(conversation_id, seq);
        CREATE INDEX idx_messages_conversation_status
          ON messages(conversation_id, status);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(1, Date.now());
    });
    applyV1();
  }

  if (!applied.has(2)) {
    const applyV2 = db.transaction(() => {
      db.exec(`
        CREATE TABLE memory_items (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN (
            'user_fact', 'confirmed_event', 'user_preference',
            'correction', 'open_question', 'previous_interpretation'
          )),
          content TEXT NOT NULL,
          normalized_key TEXT,
          source_message_id TEXT,
          confidence REAL NOT NULL DEFAULT 1.0,
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'superseded', 'deleted')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (source_message_id)
            REFERENCES messages(id)
            ON DELETE SET NULL
        );

        CREATE TABLE context_runs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          trigger_message_id TEXT NOT NULL,
          assistant_message_id TEXT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,

          context_limit INTEGER NOT NULL,
          output_reserve INTEGER NOT NULL,
          input_budget INTEGER NOT NULL,
          estimated_input_tokens INTEGER NOT NULL,
          actual_input_tokens INTEGER,
          actual_output_tokens INTEGER,
          cached_input_tokens INTEGER,

          summary_version INTEGER,
          recent_message_start_seq INTEGER,
          recent_message_count INTEGER NOT NULL DEFAULT 0,
          retrieved_message_ids_json TEXT,
          context_manifest_json TEXT NOT NULL,

          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'completed', 'failed')),
          error_code TEXT,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (trigger_message_id)
            REFERENCES messages(id)
            ON DELETE CASCADE,
          FOREIGN KEY (assistant_message_id)
            REFERENCES messages(id)
            ON DELETE SET NULL
        );

        CREATE INDEX idx_memory_items_conversation_status
          ON memory_items(conversation_id, status, updated_at DESC);
        CREATE INDEX idx_memory_items_normalized_key
          ON memory_items(conversation_id, normalized_key, status);
        CREATE INDEX idx_context_runs_conversation_created
          ON context_runs(conversation_id, created_at DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(2, Date.now());
    });
    applyV2();
  }

  if (!applied.has(3)) {
    const applyV3 = db.transaction(() => {
      db.exec(`
        CREATE TABLE transit_snapshots (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('year', 'month', 'day')),
          target_date TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, level, target_date, engine_version),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_transit_snapshots_conversation_date
          ON transit_snapshots(conversation_id, level, target_date DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(3, Date.now());
    });
    applyV3();
  }

  if (!applied.has(4)) {
    const applyV4 = db.transaction(() => {
      db.exec(`
        CREATE TABLE transit_reports (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('year')),
          target_date TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
          error_code TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER,

          UNIQUE (conversation_id, level, target_date, engine_version, prompt_version),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (snapshot_id)
            REFERENCES transit_snapshots(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_transit_reports_conversation_date
          ON transit_reports(conversation_id, level, target_date DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(4, Date.now());
    });
    applyV4();
  }

  if (!applied.has(5)) {
    const applyV5 = db.transaction(() => {
      db.exec(`
        CREATE TABLE life_events (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN (
            'education', 'career', 'finance', 'relationship', 'children',
            'relocation', 'family', 'health', 'achievement', 'custom'
          )),
          custom_category TEXT,
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT,
          date_precision TEXT NOT NULL CHECK (date_precision IN (
            'day', 'month', 'year', 'range', 'unknown'
          )),
          description TEXT,
          impact_level INTEGER NOT NULL CHECK (impact_level BETWEEN 1 AND 5),
          source TEXT NOT NULL CHECK (source IN ('user_input', 'conversation_extracted')),
          source_message_id TEXT,
          confirmed_by_user INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_by_user IN (0, 1)),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (source_message_id)
            REFERENCES messages(id)
            ON DELETE SET NULL
        );

        CREATE TABLE event_transit_links (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          snapshot_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('year')),
          target_date TEXT NOT NULL,
          relationship TEXT NOT NULL CHECK (relationship IN (
            'occurs_in', 'starts_in', 'continues_in', 'ends_in'
          )),
          created_at INTEGER NOT NULL,

          UNIQUE (event_id, level, target_date),
          FOREIGN KEY (event_id)
            REFERENCES life_events(id)
            ON DELETE CASCADE,
          FOREIGN KEY (snapshot_id)
            REFERENCES transit_snapshots(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_life_events_conversation_date
          ON life_events(conversation_id, start_date, created_at);
        CREATE INDEX idx_life_events_conversation_category
          ON life_events(conversation_id, category, start_date);
        CREATE INDEX idx_event_transit_links_event
          ON event_transit_links(event_id, target_date);
        CREATE INDEX idx_event_transit_links_snapshot
          ON event_transit_links(snapshot_id);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(5, Date.now());
    });
    applyV5();
  }

  if (!applied.has(6)) {
    const applyV6 = db.transaction(() => {
      db.exec(`
        CREATE TABLE reports (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN (
            'overview', 'personality', 'career', 'relationship',
            'wealth', 'health', 'current_daxian'
          )),
          title TEXT NOT NULL,
          active_version_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, type),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE TABLE report_versions (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          engine_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          content_json TEXT,
          status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
          error_code TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,

          UNIQUE (report_id, version),
          FOREIGN KEY (report_id)
            REFERENCES reports(id)
            ON DELETE CASCADE
        );

        CREATE TABLE report_evidence (
          id TEXT PRIMARY KEY,
          report_version_id TEXT NOT NULL,
          section_key TEXT NOT NULL,
          evidence_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          label TEXT NOT NULL,
          source TEXT NOT NULL,
          facts_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,

          UNIQUE (report_version_id, section_key, evidence_key),
          FOREIGN KEY (report_version_id)
            REFERENCES report_versions(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_reports_conversation_updated
          ON reports(conversation_id, updated_at DESC);
        CREATE INDEX idx_report_versions_report_version
          ON report_versions(report_id, version DESC);
        CREATE INDEX idx_report_evidence_version_section
          ON report_evidence(report_version_id, section_key);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(6, Date.now());
    });
    applyV6();
  }

  if (!applied.has(7)) {
    const applyV7 = db.transaction(() => {
      db.exec(`
        ALTER TABLE conversations ADD COLUMN relationship_type TEXT
          CHECK (relationship_type IN (
            'romantic', 'business', 'parent_child',
            'manager_report', 'friendship', 'custom'
          ));
        ALTER TABLE conversations ADD COLUMN relationship_context_json TEXT;

        CREATE INDEX idx_conversations_type_updated
          ON conversations(type, status, updated_at DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(7, Date.now());
    });
    applyV7();
  }

  if (!applied.has(8)) {
    const applyV8 = db.transaction(() => {
      db.exec(`
        CREATE TABLE heming_transit_snapshots (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          selected_year INTEGER NOT NULL,
          chart_engine_version TEXT NOT NULL,
          transit_engine_version TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            conversation_id, selected_year, chart_engine_version,
            transit_engine_version, methodology_version
          ),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_heming_transits_conversation_year
          ON heming_transit_snapshots(conversation_id, selected_year DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(8, Date.now());
    });
    applyV8();
  }

  if (!applied.has(9)) {
    const applyV9 = db.transaction(() => {
      db.exec(`
        CREATE TABLE rectification_sessions (
          id TEXT PRIMARY KEY,
          source_conversation_id TEXT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'ready', 'evaluated', 'confirmed', 'archived')),
          base_birth_info_json TEXT NOT NULL,
          reported_time_evidence_json TEXT NOT NULL,
          time_conversion_json TEXT,
          methodology_version TEXT NOT NULL,
          time_policy_version TEXT NOT NULL,
          chart_engine_version TEXT NOT NULL,
          transit_engine_version TEXT NOT NULL,
          selected_candidate_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (source_conversation_id)
            REFERENCES conversations(id)
            ON DELETE SET NULL
        );

        CREATE TABLE rectification_candidates (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          slot_key TEXT NOT NULL
            CHECK (slot_key IN (
              'early_zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu',
              'wei', 'shen', 'you', 'xu', 'hai', 'late_zi'
            )),
          branch_index INTEGER NOT NULL CHECK (branch_index BETWEEN 0 AND 11),
          engine_time_index INTEGER NOT NULL CHECK (engine_time_index BETWEEN 0 AND 12),
          chart_date TEXT NOT NULL,
          day_offset INTEGER NOT NULL DEFAULT 0 CHECK (day_offset BETWEEN -1 AND 1),
          chart_fingerprint TEXT NOT NULL,
          chart_snapshot_json TEXT NOT NULL,
          duplicate_of_candidate_id TEXT,
          relative_evidence_index REAL,
          rank INTEGER,
          confidence TEXT NOT NULL DEFAULT 'low'
            CHECK (confidence IN ('low', 'medium', 'high')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (session_id, slot_key),
          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (duplicate_of_candidate_id)
            REFERENCES rectification_candidates(id)
            ON DELETE SET NULL
        );

        CREATE INDEX idx_rectification_sessions_updated
          ON rectification_sessions(status, updated_at DESC);
        CREATE INDEX idx_rectification_sessions_conversation
          ON rectification_sessions(source_conversation_id, updated_at DESC);
        CREATE INDEX idx_rectification_candidates_session
          ON rectification_candidates(session_id, engine_time_index);
        CREATE INDEX idx_rectification_candidates_fingerprint
          ON rectification_candidates(session_id, chart_fingerprint);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(9, Date.now());
    });
    applyV9();
  }

  if (!applied.has(10)) {
    const applyV10 = db.transaction(() => {
      db.exec(`
        CREATE TABLE rectification_event_evidence (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          life_event_id TEXT,
          deduplication_key TEXT NOT NULL,
          event_snapshot_json TEXT NOT NULL,
          evidence_quality TEXT NOT NULL
            CHECK (evidence_quality IN (
              'documented', 'corroborated_memory', 'single_person_memory',
              'conversation_extracted', 'unconfirmed'
            )),
          user_confirmed INTEGER NOT NULL CHECK (user_confirmed IN (0, 1)),
          score_eligible INTEGER NOT NULL CHECK (score_eligible IN (0, 1)),
          methodology_version TEXT NOT NULL,
          source_event_updated_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (session_id, deduplication_key),
          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (life_event_id)
            REFERENCES life_events(id)
            ON DELETE SET NULL
        );

        CREATE TABLE rectification_candidate_event_facts (
          id TEXT PRIMARY KEY,
          session_event_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          event_year INTEGER NOT NULL,
          relationship TEXT NOT NULL
            CHECK (relationship IN ('occurs_in', 'starts_in', 'continues_in', 'ends_in')),
          candidate_chart_fingerprint TEXT NOT NULL,
          transit_engine_version TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          input_fingerprint TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (session_event_id, candidate_id, event_year),
          FOREIGN KEY (session_event_id)
            REFERENCES rectification_event_evidence(id)
            ON DELETE CASCADE,
          FOREIGN KEY (candidate_id)
            REFERENCES rectification_candidates(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_rectification_events_session
          ON rectification_event_evidence(session_id, created_at ASC);
        CREATE INDEX idx_rectification_events_source
          ON rectification_event_evidence(life_event_id);
        CREATE INDEX idx_rectification_facts_event_candidate
          ON rectification_candidate_event_facts(session_event_id, candidate_id, event_year);
        CREATE INDEX idx_rectification_facts_candidate_year
          ON rectification_candidate_event_facts(candidate_id, event_year);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(10, Date.now());
    });
    applyV10();
  }

  ensureMessageSearch(db);
}

function ensureMessageSearch(db: Database.Database) {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        conversation_id UNINDEXED,
        content,
        tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS messages_fts_insert
      AFTER INSERT ON messages WHEN new.content <> '' BEGIN
        INSERT INTO messages_fts(message_id, conversation_id, content)
        VALUES (new.id, new.conversation_id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_fts_update
      AFTER UPDATE OF content ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
        INSERT INTO messages_fts(message_id, conversation_id, content)
        SELECT new.id, new.conversation_id, new.content
        WHERE new.content <> '';
      END;

      CREATE TRIGGER IF NOT EXISTS messages_fts_delete
      AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
      END;

      INSERT INTO messages_fts(message_id, conversation_id, content)
      SELECT m.id, m.conversation_id, m.content
      FROM messages m
      WHERE m.content <> ''
        AND NOT EXISTS (
          SELECT 1 FROM messages_fts f WHERE f.message_id = m.id
        );
    `);
  } catch {
    // 某些精简 SQLite 构建不包含 FTS5；历史召回会自动降级到 LIKE 搜索。
  }
}

function createDatabase(): Database.Database {
  const databasePath = resolveDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);

  // 开发服务重启或进程意外退出后，不让旧的流式消息永久停留在 streaming 状态。
  db.prepare(`
    UPDATE messages
    SET status = 'failed', error_code = 'interrupted_by_restart', updated_at = ?
    WHERE status = 'streaming'
  `).run(Date.now());

  return db;
}

export function getDatabase(): Database.Database {
  if (!globalThis.__ziweiSqlite) {
    globalThis.__ziweiSqlite = createDatabase();
  }
  return globalThis.__ziweiSqlite;
}

export function getDatabasePath(): string {
  return resolveDatabasePath();
}
