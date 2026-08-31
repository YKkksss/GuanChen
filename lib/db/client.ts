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

  if (!applied.has(11)) {
    const applyV11 = db.transaction(() => {
      db.exec(`
        CREATE TABLE rectification_evaluations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          input_fingerprint TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          evaluation_engine_version TEXT NOT NULL,
          evaluation_json TEXT NOT NULL,
          stable INTEGER NOT NULL CHECK (stable IN (0, 1)),
          top_margin_ratio REAL,
          created_at INTEGER NOT NULL,

          UNIQUE (session_id, version),
          UNIQUE (session_id, input_fingerprint, methodology_version),
          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE
        );

        CREATE TABLE rectification_rule_hits (
          id TEXT PRIMARY KEY,
          evaluation_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          session_event_id TEXT,
          life_event_id TEXT,
          category TEXT,
          rule_id TEXT NOT NULL,
          rule_version INTEGER NOT NULL,
          outcome TEXT NOT NULL
            CHECK (outcome IN ('support', 'weak_support', 'neutral', 'conflict', 'insufficient')),
          raw_weight REAL NOT NULL,
          adjusted_weight REAL NOT NULL,
          discriminating INTEGER NOT NULL CHECK (discriminating IN (0, 1)),
          evidence_json TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          created_at INTEGER NOT NULL,

          FOREIGN KEY (evaluation_id)
            REFERENCES rectification_evaluations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_rectification_evaluations_session_version
          ON rectification_evaluations(session_id, version DESC);
        CREATE INDEX idx_rectification_hits_evaluation_candidate
          ON rectification_rule_hits(evaluation_id, candidate_id, session_event_id);
        CREATE INDEX idx_rectification_hits_rule
          ON rectification_rule_hits(evaluation_id, rule_id, discriminating);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(11, Date.now());
    });
    applyV11();
  }

  if (!applied.has(12)) {
    const applyV12 = db.transaction(() => {
      db.exec(`
        CREATE TABLE rectification_selections (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          evaluation_id TEXT NOT NULL,
          evaluation_version INTEGER NOT NULL,
          rank INTEGER NOT NULL,
          relative_evidence_index REAL NOT NULL,
          confidence TEXT NOT NULL
            CHECK (confidence IN ('low', 'medium', 'high')),
          stable INTEGER NOT NULL CHECK (stable IN (0, 1)),
          acknowledged_limitations INTEGER NOT NULL CHECK (acknowledged_limitations IN (0, 1)),
          note TEXT,
          created_at INTEGER NOT NULL,

          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (candidate_id)
            REFERENCES rectification_candidates(id)
            ON DELETE CASCADE,
          FOREIGN KEY (evaluation_id)
            REFERENCES rectification_evaluations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_rectification_selections_session_created
          ON rectification_selections(session_id, created_at DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(12, Date.now());
    });
    applyV12();
  }

  if (!applied.has(13)) {
    const applyV13 = db.transaction(() => {
      db.exec(`
        CREATE TABLE rectification_reports (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          active_version_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE
        );

        CREATE TABLE rectification_report_versions (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          evaluation_id TEXT NOT NULL,
          selection_id TEXT,
          version INTEGER NOT NULL,
          input_fingerprint TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          evaluation_engine_version TEXT NOT NULL,
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
            REFERENCES rectification_reports(id)
            ON DELETE CASCADE,
          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (evaluation_id)
            REFERENCES rectification_evaluations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (selection_id)
            REFERENCES rectification_selections(id)
            ON DELETE SET NULL
        );

        CREATE TABLE rectification_report_evidence (
          id TEXT PRIMARY KEY,
          report_version_id TEXT NOT NULL,
          section_key TEXT NOT NULL,
          evidence_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          label TEXT NOT NULL,
          facts_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,

          UNIQUE (report_version_id, section_key, evidence_key),
          FOREIGN KEY (report_version_id)
            REFERENCES rectification_report_versions(id)
            ON DELETE CASCADE
        );

        CREATE TABLE rectification_conversation_links (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          selection_id TEXT NOT NULL UNIQUE,
          conversation_id TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,

          FOREIGN KEY (session_id)
            REFERENCES rectification_sessions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (selection_id)
            REFERENCES rectification_selections(id)
            ON DELETE CASCADE,
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_rectification_reports_session
          ON rectification_reports(session_id, updated_at DESC);
        CREATE INDEX idx_rectification_report_versions_report
          ON rectification_report_versions(report_id, version DESC);
        CREATE INDEX idx_rectification_report_versions_input
          ON rectification_report_versions(session_id, input_fingerprint, status);
        CREATE INDEX idx_rectification_report_evidence_version
          ON rectification_report_evidence(report_version_id, section_key);
        CREATE INDEX idx_rectification_conversation_links_session
          ON rectification_conversation_links(session_id, created_at DESC);
      `);

      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(13, Date.now());
    });
    applyV13();
  }

  if (!applied.has(14)) {
    const applyV14 = db.transaction(() => {
      db.exec(`
        CREATE TABLE learning_notes (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          knowledge_point_id TEXT NOT NULL,
          palace_branch INTEGER NOT NULL CHECK (palace_branch BETWEEN 0 AND 11),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, knowledge_point_id, palace_branch),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_learning_notes_conversation_updated
          ON learning_notes(conversation_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(14, Date.now());
    });
    applyV14();
  }

  if (!applied.has(15)) {
    const applyV15 = db.transaction(() => {
      db.exec(`
        CREATE TABLE learning_progress (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL,
          lesson_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
          best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
          attempts_count INTEGER NOT NULL DEFAULT 0 CHECK (attempts_count >= 0),
          latest_answers_json TEXT NOT NULL DEFAULT '{}',
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          updated_at INTEGER NOT NULL,

          UNIQUE (course_id, lesson_id)
        );

        CREATE TABLE learning_attempts (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL,
          lesson_id TEXT NOT NULL,
          score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
          passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
          answers_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_learning_progress_course_updated
          ON learning_progress(course_id, updated_at DESC);
        CREATE INDEX idx_learning_attempts_course_lesson_created
          ON learning_attempts(course_id, lesson_id, created_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(15, Date.now());
    });
    applyV15();
  }

  if (!applied.has(16)) {
    const applyV16 = db.transaction(() => {
      db.exec(`
        CREATE TABLE learning_practice_attempts (
          id TEXT PRIMARY KEY,
          practice_set_id TEXT NOT NULL,
          conversation_id TEXT,
          score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
          passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
          answers_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          question_snapshot_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE SET NULL
        );

        CREATE TABLE learning_knowledge_progress (
          knowledge_point_id TEXT PRIMARY KEY,
          attempts_count INTEGER NOT NULL DEFAULT 0 CHECK (attempts_count >= 0),
          correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
          wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
          mastery_score INTEGER NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 100),
          status TEXT NOT NULL CHECK (status IN ('learning', 'reviewing', 'mastered')),
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE learning_review_items (
          id TEXT PRIMARY KEY,
          question_key TEXT NOT NULL UNIQUE,
          source_type TEXT NOT NULL CHECK (source_type IN ('lesson_quiz', 'practice')),
          source_ref TEXT NOT NULL,
          question_json TEXT NOT NULL,
          latest_wrong_answer TEXT,
          status TEXT NOT NULL CHECK (status IN ('due', 'reviewing', 'mastered')),
          wrong_count INTEGER NOT NULL DEFAULT 1 CHECK (wrong_count >= 1),
          correct_streak INTEGER NOT NULL DEFAULT 0 CHECK (correct_streak >= 0),
          next_review_at INTEGER NOT NULL,
          last_wrong_at INTEGER NOT NULL,
          mastered_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_learning_practice_attempts_set_created
          ON learning_practice_attempts(practice_set_id, created_at DESC);
        CREATE INDEX idx_learning_practice_attempts_conversation
          ON learning_practice_attempts(conversation_id, created_at DESC);
        CREATE INDEX idx_learning_knowledge_progress_status
          ON learning_knowledge_progress(status, mastery_score ASC);
        CREATE INDEX idx_learning_review_items_status_next
          ON learning_review_items(status, next_review_at ASC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(16, Date.now());
    });
    applyV16();
  }

  if (!applied.has(17)) {
    const applyV17 = db.transaction(() => {
      db.exec(`
        CREATE TABLE learning_open_practice_attempts (
          id TEXT PRIMARY KEY,
          exercise_id TEXT NOT NULL,
          exercise_template_id TEXT NOT NULL,
          conversation_id TEXT,
          parent_attempt_id TEXT,
          answer TEXT NOT NULL,
          score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
          passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
          rubric_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          status TEXT NOT NULL
            CHECK (status IN ('pending_feedback', 'completed', 'feedback_failed')),
          grade_json TEXT NOT NULL,
          exercise_snapshot_json TEXT NOT NULL,
          feedback_json TEXT,
          error_code TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE SET NULL,
          FOREIGN KEY (parent_attempt_id)
            REFERENCES learning_open_practice_attempts(id)
            ON DELETE SET NULL
        );

        CREATE INDEX idx_learning_open_attempts_conversation
          ON learning_open_practice_attempts(conversation_id, created_at DESC);
        CREATE INDEX idx_learning_open_attempts_template
          ON learning_open_practice_attempts(exercise_template_id, created_at DESC);
        CREATE INDEX idx_learning_open_attempts_parent
          ON learning_open_practice_attempts(parent_attempt_id, created_at ASC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(17, Date.now());
    });
    applyV17();
  }

  if (!applied.has(18)) {
    const applyV18 = db.transaction(() => {
      db.exec(`
        CREATE TABLE case_records (
          id TEXT PRIMARY KEY,
          case_code TEXT NOT NULL UNIQUE,
          source_conversation_id TEXT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'reviewed', 'archived')),
          confidence TEXT NOT NULL DEFAULT 'medium'
            CHECK (confidence IN ('low', 'medium', 'high')),
          chart_snapshot_json TEXT NOT NULL,
          anonymization_version TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          reviewed_at INTEGER,

          FOREIGN KEY (source_conversation_id)
            REFERENCES conversations(id)
            ON DELETE SET NULL
        );

        CREATE TABLE case_sources (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          source_type TEXT NOT NULL
            CHECK (source_type IN ('local_chart', 'public_record', 'authorized_teaching', 'historical_record')),
          citation TEXT,
          note TEXT,
          reliability TEXT NOT NULL DEFAULT 'medium'
            CHECK (reliability IN ('low', 'medium', 'high')),
          created_at INTEGER NOT NULL,

          FOREIGN KEY (case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE TABLE case_consents (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          scope TEXT NOT NULL
            CHECK (scope IN ('local_only', 'teaching', 'anonymous_export', 'public_release')),
          status TEXT NOT NULL
            CHECK (status IN ('active', 'revoked')),
          consent_version TEXT NOT NULL,
          confirmed_at INTEGER NOT NULL,
          revoked_at INTEGER,
          updated_at INTEGER NOT NULL,

          UNIQUE (case_id, scope),
          FOREIGN KEY (case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE TABLE case_event_snapshots (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          category TEXT NOT NULL,
          age_band TEXT,
          date_precision TEXT NOT NULL
            CHECK (date_precision IN ('year', 'range', 'unknown')),
          impact_level INTEGER NOT NULL CHECK (impact_level BETWEEN 1 AND 5),
          source_kind TEXT NOT NULL DEFAULT 'user_confirmed',
          created_at INTEGER NOT NULL,

          FOREIGN KEY (case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE TABLE case_audit_logs (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          action TEXT NOT NULL,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,

          FOREIGN KEY (case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_case_records_status_updated
          ON case_records(status, updated_at DESC);
        CREATE INDEX idx_case_records_source_conversation
          ON case_records(source_conversation_id, updated_at DESC);
        CREATE INDEX idx_case_sources_case
          ON case_sources(case_id, created_at ASC);
        CREATE INDEX idx_case_consents_case_status
          ON case_consents(case_id, status, scope);
        CREATE INDEX idx_case_events_case_category
          ON case_event_snapshots(case_id, category);
        CREATE INDEX idx_case_audits_case_created
          ON case_audit_logs(case_id, created_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(18, Date.now());
    });
    applyV18();
  }

  if (!applied.has(19)) {
    const applyV19 = db.transaction(() => {
      db.exec(`
        ALTER TABLE case_records ADD COLUMN search_index_version INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE case_search_facets (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          facet_type TEXT NOT NULL CHECK (facet_type IN (
            'ming_branch', 'ming_major_star', 'sihua',
            'pattern', 'wuxing_ju', 'event_category'
          )),
          facet_value TEXT NOT NULL,
          facet_label TEXT NOT NULL,
          created_at INTEGER NOT NULL,

          UNIQUE (case_id, facet_type, facet_value),
          FOREIGN KEY (case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_case_facets_type_value
          ON case_search_facets(facet_type, facet_value, case_id);
        CREATE INDEX idx_case_facets_case
          ON case_search_facets(case_id, facet_type);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(19, Date.now());
    });
    applyV19();
  }

  if (!applied.has(20)) {
    const applyV20 = db.transaction(() => {
      db.exec(`
        CREATE TABLE case_comparisons (
          id TEXT PRIMARY KEY,
          comparison_code TEXT NOT NULL UNIQUE,
          comparison_key TEXT NOT NULL UNIQUE,
          mode TEXT NOT NULL CHECK (mode IN ('chart_to_chart', 'daxian_to_daxian')),
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'archived')),
          left_case_id TEXT NOT NULL,
          right_case_id TEXT NOT NULL,
          left_stage_key TEXT,
          right_stage_key TEXT,
          engine_version TEXT NOT NULL,
          result_json TEXT NOT NULL,
          left_case_updated_at INTEGER NOT NULL,
          right_case_updated_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (left_case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE,
          FOREIGN KEY (right_case_id)
            REFERENCES case_records(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_case_comparisons_status_updated
          ON case_comparisons(status, updated_at DESC);
        CREATE INDEX idx_case_comparisons_left_case
          ON case_comparisons(left_case_id, updated_at DESC);
        CREATE INDEX idx_case_comparisons_right_case
          ON case_comparisons(right_case_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(20, Date.now());
    });
    applyV20();
  }

  if (!applied.has(21)) {
    const applyV21 = db.transaction(() => {
      db.exec(`
        CREATE TABLE reminder_rules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN (
            'monthly_review', 'birthday_review', 'transit_change',
            'event_anniversary', 'custom'
          )),
          status TEXT NOT NULL DEFAULT 'enabled'
            CHECK (status IN ('enabled', 'disabled', 'archived')),
          conversation_id TEXT,
          event_id TEXT,
          timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
          config_json TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          last_materialized_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (event_id)
            REFERENCES life_events(id)
            ON DELETE CASCADE
        );

        CREATE TABLE reminder_instances (
          id TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          occurrence_key TEXT NOT NULL,
          scheduled_for TEXT NOT NULL,
          due_at INTEGER NOT NULL,
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'completed', 'dismissed')),
          completed_at INTEGER,
          dismissed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (rule_id, occurrence_key),
          FOREIGN KEY (rule_id)
            REFERENCES reminder_rules(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_reminder_rules_status_kind
          ON reminder_rules(status, kind, updated_at DESC);
        CREATE INDEX idx_reminder_rules_conversation
          ON reminder_rules(conversation_id, status, updated_at DESC);
        CREATE INDEX idx_reminder_rules_event
          ON reminder_rules(event_id, status, updated_at DESC);
        CREATE INDEX idx_reminder_instances_status_due
          ON reminder_instances(status, due_at ASC);
        CREATE INDEX idx_reminder_instances_rule_due
          ON reminder_instances(rule_id, due_at ASC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(21, Date.now());
    });
    applyV21();
  }

  if (!applied.has(22)) {
    const applyV22 = db.transaction(() => {
      db.exec(`
        CREATE TABLE monthly_reviews (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          reminder_instance_id TEXT,
          review_month TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'confirmed')),
          important_events TEXT NOT NULL DEFAULT '',
          scores_json TEXT NOT NULL DEFAULT '{}',
          prior_prediction TEXT NOT NULL DEFAULT '',
          actual_outcome TEXT NOT NULL DEFAULT '',
          prediction_match TEXT NOT NULL DEFAULT 'not_reviewed'
            CHECK (prediction_match IN ('not_reviewed', 'matched', 'partial', 'not_matched')),
          corrections TEXT NOT NULL DEFAULT '',
          next_focus TEXT NOT NULL DEFAULT '',
          generated_event_id TEXT,
          generated_memory_id TEXT,
          confirmed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, review_month),
          FOREIGN KEY (conversation_id)
            REFERENCES conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (reminder_instance_id)
            REFERENCES reminder_instances(id)
            ON DELETE SET NULL,
          FOREIGN KEY (generated_event_id)
            REFERENCES life_events(id)
            ON DELETE SET NULL,
          FOREIGN KEY (generated_memory_id)
            REFERENCES memory_items(id)
            ON DELETE SET NULL
        );

        CREATE UNIQUE INDEX idx_monthly_reviews_reminder
          ON monthly_reviews(reminder_instance_id)
          WHERE reminder_instance_id IS NOT NULL;
        CREATE INDEX idx_monthly_reviews_conversation_month
          ON monthly_reviews(conversation_id, review_month DESC);
        CREATE INDEX idx_monthly_reviews_status_updated
          ON monthly_reviews(status, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(22, Date.now());
    });
    applyV22();
  }

  if (!applied.has(23)) {
    const applyV23 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_birth_profiles (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          birth_date TEXT NOT NULL,
          birth_time TEXT,
          gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
          unknown_time INTEGER NOT NULL DEFAULT 0 CHECK (unknown_time IN (0, 1)),
          timezone_id TEXT NOT NULL,
          longitude REAL,
          location_label TEXT,
          notes TEXT,
          source_conversation_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          CHECK (
            (unknown_time = 1 AND birth_time IS NULL)
            OR (unknown_time = 0 AND birth_time IS NOT NULL)
          ),
          CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
          FOREIGN KEY (source_conversation_id)
            REFERENCES conversations(id)
            ON DELETE SET NULL
        );

        CREATE TABLE bazi_chart_versions (
          id TEXT PRIMARY KEY,
          birth_profile_id TEXT NOT NULL,
          input_fingerprint TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          time_standard TEXT NOT NULL
            CHECK (time_standard IN ('civil_time', 'apparent_solar_time')),
          late_zi_policy TEXT NOT NULL
            CHECK (late_zi_policy IN ('same_day', 'next_day')),
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          input_snapshot_json TEXT NOT NULL,
          effective_time_snapshot_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (birth_profile_id, input_fingerprint),
          FOREIGN KEY (birth_profile_id)
            REFERENCES bazi_birth_profiles(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_bazi_profiles_updated
          ON bazi_birth_profiles(updated_at DESC);
        CREATE INDEX idx_bazi_profiles_conversation
          ON bazi_birth_profiles(source_conversation_id, updated_at DESC);
        CREATE INDEX idx_bazi_charts_profile_updated
          ON bazi_chart_versions(birth_profile_id, updated_at DESC);
        CREATE INDEX idx_bazi_charts_fingerprint
          ON bazi_chart_versions(chart_fingerprint);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(23, Date.now());
    });
    applyV23();
  }

  if (!applied.has(24)) {
    const applyV24 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_conversations (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'archived')),
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          summary_json TEXT,
          summary_through_seq INTEGER NOT NULL DEFAULT 0,
          summary_version INTEGER NOT NULL DEFAULT 1,
          summary_updated_at INTEGER,
          last_message_seq INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE
        );

        CREATE TABLE bazi_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'question',
          status TEXT NOT NULL DEFAULT 'completed'
            CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
          token_count INTEGER NOT NULL DEFAULT 0,
          error_code TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (conversation_id, seq),
          FOREIGN KEY (conversation_id)
            REFERENCES bazi_conversations(id)
            ON DELETE CASCADE
        );

        CREATE TABLE bazi_context_runs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          trigger_message_id TEXT NOT NULL,
          assistant_message_id TEXT NOT NULL,
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
          context_manifest_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'completed', 'failed')),
          error_code TEXT,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,

          FOREIGN KEY (conversation_id)
            REFERENCES bazi_conversations(id)
            ON DELETE CASCADE,
          FOREIGN KEY (trigger_message_id)
            REFERENCES bazi_messages(id)
            ON DELETE CASCADE,
          FOREIGN KEY (assistant_message_id)
            REFERENCES bazi_messages(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_bazi_conversations_status_updated
          ON bazi_conversations(status, updated_at DESC);
        CREATE INDEX idx_bazi_conversations_chart_updated
          ON bazi_conversations(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_messages_conversation_seq
          ON bazi_messages(conversation_id, seq);
        CREATE INDEX idx_bazi_messages_conversation_status
          ON bazi_messages(conversation_id, status);
        CREATE INDEX idx_bazi_context_runs_conversation_created
          ON bazi_context_runs(conversation_id, created_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(24, Date.now());
    });
    applyV24();
  }

  if (!applied.has(25)) {
    const applyV25 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_analysis_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          analysis_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (chart_version_id, methodology_version, engine_version),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN analysis_version_id TEXT
          REFERENCES bazi_analysis_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_analysis_chart_updated
          ON bazi_analysis_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_analysis_fingerprint
          ON bazi_analysis_versions(analysis_fingerprint);
        CREATE INDEX idx_bazi_conversations_analysis
          ON bazi_conversations(analysis_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(25, Date.now());
    });
    applyV25();
  }

  if (!applied.has(26)) {
    const applyV26 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_luck_cycle_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          luck_cycle_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (chart_version_id, methodology_version, engine_version),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN luck_cycle_version_id TEXT
          REFERENCES bazi_luck_cycle_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_luck_cycles_chart_updated
          ON bazi_luck_cycle_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_luck_cycles_fingerprint
          ON bazi_luck_cycle_versions(luck_cycle_fingerprint);
        CREATE INDEX idx_bazi_conversations_luck_cycles
          ON bazi_conversations(luck_cycle_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(26, Date.now());
    });
    applyV26();
  }

  if (!applied.has(27)) {
    const applyV27 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_annual_timeline_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          luck_cycle_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          luck_cycle_fingerprint TEXT NOT NULL,
          annual_timeline_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (chart_version_id, luck_cycle_version_id, methodology_version, engine_version),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (luck_cycle_version_id)
            REFERENCES bazi_luck_cycle_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN annual_timeline_version_id TEXT
          REFERENCES bazi_annual_timeline_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_annual_timeline_chart_updated
          ON bazi_annual_timeline_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_annual_timeline_fingerprint
          ON bazi_annual_timeline_versions(annual_timeline_fingerprint);
        CREATE INDEX idx_bazi_conversations_annual_timeline
          ON bazi_conversations(annual_timeline_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(27, Date.now());
    });
    applyV27();
  }

  if (!applied.has(28)) {
    const applyV28 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_relation_audit_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          luck_cycle_version_id TEXT NOT NULL,
          annual_timeline_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          luck_cycle_fingerprint TEXT NOT NULL,
          annual_timeline_fingerprint TEXT NOT NULL,
          relation_audit_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (chart_version_id, luck_cycle_version_id, annual_timeline_version_id, methodology_version, engine_version),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (luck_cycle_version_id)
            REFERENCES bazi_luck_cycle_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (annual_timeline_version_id)
            REFERENCES bazi_annual_timeline_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN relation_audit_version_id TEXT
          REFERENCES bazi_relation_audit_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_relation_audit_chart_updated
          ON bazi_relation_audit_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_relation_audit_fingerprint
          ON bazi_relation_audit_versions(relation_audit_fingerprint);
        CREATE INDEX idx_bazi_conversations_relation_audit
          ON bazi_conversations(relation_audit_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(28, Date.now());
    });
    applyV28();
  }

  if (!applied.has(29)) {
    const applyV29 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_relation_adjudication_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          relation_audit_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          relation_audit_fingerprint TEXT NOT NULL,
          relation_adjudication_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (chart_version_id, relation_audit_version_id, methodology_version, engine_version),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (relation_audit_version_id)
            REFERENCES bazi_relation_audit_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN relation_adjudication_version_id TEXT
          REFERENCES bazi_relation_adjudication_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_relation_adjudication_chart_updated
          ON bazi_relation_adjudication_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_relation_adjudication_fingerprint
          ON bazi_relation_adjudication_versions(relation_adjudication_fingerprint);
        CREATE INDEX idx_bazi_conversations_relation_adjudication
          ON bazi_conversations(relation_adjudication_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(29, Date.now());
    });
    applyV29();
  }

  if (!applied.has(30)) {
    const applyV30 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_dynamic_ten_god_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          annual_timeline_version_id TEXT NOT NULL,
          relation_audit_version_id TEXT NOT NULL,
          relation_adjudication_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          annual_timeline_fingerprint TEXT NOT NULL,
          relation_audit_fingerprint TEXT NOT NULL,
          relation_adjudication_fingerprint TEXT NOT NULL,
          dynamic_ten_god_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, annual_timeline_version_id, relation_audit_version_id,
            relation_adjudication_version_id, methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (annual_timeline_version_id)
            REFERENCES bazi_annual_timeline_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (relation_audit_version_id)
            REFERENCES bazi_relation_audit_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (relation_adjudication_version_id)
            REFERENCES bazi_relation_adjudication_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN dynamic_ten_god_version_id TEXT
          REFERENCES bazi_dynamic_ten_god_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_dynamic_ten_god_chart_updated
          ON bazi_dynamic_ten_god_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_dynamic_ten_god_fingerprint
          ON bazi_dynamic_ten_god_versions(dynamic_ten_god_fingerprint);
        CREATE INDEX idx_bazi_conversations_dynamic_ten_god
          ON bazi_conversations(dynamic_ten_god_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(30, Date.now());
    });
    applyV30();
  }

  if (!applied.has(31)) {
    const applyV31 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_ten_god_repeat_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          relation_audit_version_id TEXT NOT NULL,
          dynamic_ten_god_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          relation_audit_fingerprint TEXT NOT NULL,
          dynamic_ten_god_fingerprint TEXT NOT NULL,
          ten_god_repeat_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, relation_audit_version_id, dynamic_ten_god_version_id,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (relation_audit_version_id)
            REFERENCES bazi_relation_audit_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (dynamic_ten_god_version_id)
            REFERENCES bazi_dynamic_ten_god_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN ten_god_repeat_version_id TEXT
          REFERENCES bazi_ten_god_repeat_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_ten_god_repeat_chart_updated
          ON bazi_ten_god_repeat_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_ten_god_repeat_fingerprint
          ON bazi_ten_god_repeat_versions(ten_god_repeat_fingerprint);
        CREATE INDEX idx_bazi_conversations_ten_god_repeat
          ON bazi_conversations(ten_god_repeat_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(31, Date.now());
    });
    applyV31();
  }

  if (!applied.has(32)) {
    const applyV32 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_transparency_root_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          dynamic_ten_god_version_id TEXT NOT NULL,
          ten_god_repeat_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          dynamic_ten_god_fingerprint TEXT NOT NULL,
          ten_god_repeat_fingerprint TEXT NOT NULL,
          transparency_root_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, dynamic_ten_god_version_id, ten_god_repeat_version_id,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id)
            REFERENCES bazi_chart_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (dynamic_ten_god_version_id)
            REFERENCES bazi_dynamic_ten_god_versions(id)
            ON DELETE CASCADE,
          FOREIGN KEY (ten_god_repeat_version_id)
            REFERENCES bazi_ten_god_repeat_versions(id)
            ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN transparency_root_version_id TEXT
          REFERENCES bazi_transparency_root_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_transparency_root_chart_updated
          ON bazi_transparency_root_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_transparency_root_fingerprint
          ON bazi_transparency_root_versions(transparency_root_fingerprint);
        CREATE INDEX idx_bazi_conversations_transparency_root
          ON bazi_conversations(transparency_root_version_id, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(32, Date.now());
    });
    applyV32();
  }

  if (!applied.has(33)) {
    const applyV33 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_hidden_stem_activation_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          relation_audit_version_id TEXT NOT NULL,
          relation_adjudication_version_id TEXT NOT NULL,
          dynamic_ten_god_version_id TEXT NOT NULL,
          ten_god_repeat_version_id TEXT NOT NULL,
          transparency_root_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          relation_audit_fingerprint TEXT NOT NULL,
          relation_adjudication_fingerprint TEXT NOT NULL,
          dynamic_ten_god_fingerprint TEXT NOT NULL,
          ten_god_repeat_fingerprint TEXT NOT NULL,
          transparency_root_fingerprint TEXT NOT NULL,
          hidden_stem_activation_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, relation_audit_version_id, relation_adjudication_version_id,
            dynamic_ten_god_version_id, ten_god_repeat_version_id, transparency_root_version_id,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (relation_audit_version_id) REFERENCES bazi_relation_audit_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (relation_adjudication_version_id) REFERENCES bazi_relation_adjudication_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (dynamic_ten_god_version_id) REFERENCES bazi_dynamic_ten_god_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (ten_god_repeat_version_id) REFERENCES bazi_ten_god_repeat_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (transparency_root_version_id) REFERENCES bazi_transparency_root_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN hidden_stem_activation_version_id TEXT
          REFERENCES bazi_hidden_stem_activation_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_hidden_stem_activation_chart_updated
          ON bazi_hidden_stem_activation_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_hidden_stem_activation_fingerprint
          ON bazi_hidden_stem_activation_versions(hidden_stem_activation_fingerprint);
        CREATE INDEX idx_bazi_conversations_hidden_stem_activation
          ON bazi_conversations(hidden_stem_activation_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(33, Date.now());
    });
    applyV33();
  }

  if (!applied.has(34)) {
    const applyV34 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_strength_composite_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          analysis_version_id TEXT NOT NULL,
          dynamic_ten_god_version_id TEXT NOT NULL,
          transparency_root_version_id TEXT NOT NULL,
          hidden_stem_activation_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          analysis_fingerprint TEXT NOT NULL,
          dynamic_ten_god_fingerprint TEXT NOT NULL,
          transparency_root_fingerprint TEXT NOT NULL,
          hidden_stem_activation_fingerprint TEXT NOT NULL,
          strength_composite_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, analysis_version_id, dynamic_ten_god_version_id,
            transparency_root_version_id, hidden_stem_activation_version_id,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (analysis_version_id) REFERENCES bazi_analysis_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (dynamic_ten_god_version_id) REFERENCES bazi_dynamic_ten_god_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (transparency_root_version_id) REFERENCES bazi_transparency_root_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (hidden_stem_activation_version_id) REFERENCES bazi_hidden_stem_activation_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN strength_composite_version_id TEXT
          REFERENCES bazi_strength_composite_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_strength_composite_chart_updated
          ON bazi_strength_composite_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_strength_composite_fingerprint
          ON bazi_strength_composite_versions(strength_composite_fingerprint);
        CREATE INDEX idx_bazi_conversations_strength_composite
          ON bazi_conversations(strength_composite_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(34, Date.now());
    });
    applyV34();
  }

  if (!applied.has(35)) {
    const applyV35 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_pattern_condition_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          analysis_version_id TEXT NOT NULL,
          strength_composite_version_id TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          analysis_fingerprint TEXT NOT NULL,
          strength_composite_fingerprint TEXT NOT NULL,
          pattern_condition_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, analysis_version_id, strength_composite_version_id,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (analysis_version_id) REFERENCES bazi_analysis_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (strength_composite_version_id) REFERENCES bazi_strength_composite_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN pattern_condition_version_id TEXT
          REFERENCES bazi_pattern_condition_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_pattern_condition_chart_updated
          ON bazi_pattern_condition_versions(chart_version_id, updated_at DESC);
        CREATE INDEX idx_bazi_pattern_condition_fingerprint
          ON bazi_pattern_condition_versions(pattern_condition_fingerprint);
        CREATE INDEX idx_bazi_conversations_pattern_condition
          ON bazi_conversations(pattern_condition_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(35, Date.now());
    });
    applyV35();
  }

  if (!applied.has(36)) {
    const applyV36 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_month_day_timeline_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          annual_timeline_version_id TEXT NOT NULL,
          target_year INTEGER NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          annual_timeline_fingerprint TEXT NOT NULL,
          month_day_timeline_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, annual_timeline_version_id, target_year,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (annual_timeline_version_id) REFERENCES bazi_annual_timeline_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN month_day_timeline_version_id TEXT
          REFERENCES bazi_month_day_timeline_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_month_day_timeline_chart_year
          ON bazi_month_day_timeline_versions(chart_version_id, target_year, updated_at DESC);
        CREATE INDEX idx_bazi_month_day_timeline_fingerprint
          ON bazi_month_day_timeline_versions(month_day_timeline_fingerprint);
        CREATE INDEX idx_bazi_conversations_month_day_timeline
          ON bazi_conversations(month_day_timeline_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(36, Date.now());
    });
    applyV36();
  }

  if (!applied.has(37)) {
    const applyV37 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_month_day_relation_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          month_day_timeline_version_id TEXT NOT NULL,
          target_date TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          month_day_timeline_fingerprint TEXT NOT NULL,
          month_day_relation_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, month_day_timeline_version_id, target_date,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_timeline_version_id) REFERENCES bazi_month_day_timeline_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN month_day_relation_version_id TEXT
          REFERENCES bazi_month_day_relation_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_month_day_relation_chart_date
          ON bazi_month_day_relation_versions(chart_version_id, target_date, updated_at DESC);
        CREATE INDEX idx_bazi_month_day_relation_fingerprint
          ON bazi_month_day_relation_versions(month_day_relation_fingerprint);
        CREATE INDEX idx_bazi_conversations_month_day_relation
          ON bazi_conversations(month_day_relation_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(37, Date.now());
    });
    applyV37();
  }

  if (!applied.has(38)) {
    const applyV38 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_month_day_visibility_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          month_day_relation_version_id TEXT NOT NULL,
          target_date TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          month_day_relation_fingerprint TEXT NOT NULL,
          month_day_visibility_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, month_day_relation_version_id, target_date,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_relation_version_id) REFERENCES bazi_month_day_relation_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN month_day_visibility_version_id TEXT
          REFERENCES bazi_month_day_visibility_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_month_day_visibility_chart_date
          ON bazi_month_day_visibility_versions(chart_version_id, target_date, updated_at DESC);
        CREATE INDEX idx_bazi_month_day_visibility_fingerprint
          ON bazi_month_day_visibility_versions(month_day_visibility_fingerprint);
        CREATE INDEX idx_bazi_conversations_month_day_visibility
          ON bazi_conversations(month_day_visibility_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(38, Date.now());
    });
    applyV38();
  }

  if (!applied.has(39)) {
    const applyV39 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_month_day_strength_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          analysis_version_id TEXT NOT NULL,
          month_day_relation_version_id TEXT NOT NULL,
          month_day_visibility_version_id TEXT NOT NULL,
          target_date TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          analysis_fingerprint TEXT NOT NULL,
          month_day_relation_fingerprint TEXT NOT NULL,
          month_day_visibility_fingerprint TEXT NOT NULL,
          month_day_strength_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, analysis_version_id,
            month_day_relation_version_id, month_day_visibility_version_id,
            target_date, methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (analysis_version_id) REFERENCES bazi_analysis_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_relation_version_id) REFERENCES bazi_month_day_relation_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_visibility_version_id) REFERENCES bazi_month_day_visibility_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN month_day_strength_version_id TEXT
          REFERENCES bazi_month_day_strength_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_month_day_strength_chart_date
          ON bazi_month_day_strength_versions(chart_version_id, target_date, updated_at DESC);
        CREATE INDEX idx_bazi_month_day_strength_fingerprint
          ON bazi_month_day_strength_versions(month_day_strength_fingerprint);
        CREATE INDEX idx_bazi_conversations_month_day_strength
          ON bazi_conversations(month_day_strength_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(39, Date.now());
    });
    applyV39();
  }

  if (!applied.has(40)) {
    const applyV40 = db.transaction(() => {
      db.exec(`
        CREATE TABLE bazi_month_day_pattern_versions (
          id TEXT PRIMARY KEY,
          chart_version_id TEXT NOT NULL,
          pattern_condition_version_id TEXT NOT NULL,
          month_day_relation_version_id TEXT NOT NULL,
          month_day_visibility_version_id TEXT NOT NULL,
          month_day_strength_version_id TEXT NOT NULL,
          target_date TEXT NOT NULL,
          methodology_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          chart_fingerprint TEXT NOT NULL,
          pattern_condition_fingerprint TEXT NOT NULL,
          month_day_relation_fingerprint TEXT NOT NULL,
          month_day_visibility_fingerprint TEXT NOT NULL,
          month_day_strength_fingerprint TEXT NOT NULL,
          month_day_pattern_fingerprint TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,

          UNIQUE (
            chart_version_id, pattern_condition_version_id,
            month_day_relation_version_id, month_day_visibility_version_id,
            month_day_strength_version_id, target_date,
            methodology_version, engine_version
          ),
          FOREIGN KEY (chart_version_id) REFERENCES bazi_chart_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (pattern_condition_version_id) REFERENCES bazi_pattern_condition_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_relation_version_id) REFERENCES bazi_month_day_relation_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_visibility_version_id) REFERENCES bazi_month_day_visibility_versions(id) ON DELETE CASCADE,
          FOREIGN KEY (month_day_strength_version_id) REFERENCES bazi_month_day_strength_versions(id) ON DELETE CASCADE
        );

        ALTER TABLE bazi_conversations
          ADD COLUMN month_day_pattern_version_id TEXT
          REFERENCES bazi_month_day_pattern_versions(id)
          ON DELETE SET NULL;

        CREATE INDEX idx_bazi_month_day_pattern_chart_date
          ON bazi_month_day_pattern_versions(chart_version_id, target_date, updated_at DESC);
        CREATE INDEX idx_bazi_month_day_pattern_fingerprint
          ON bazi_month_day_pattern_versions(month_day_pattern_fingerprint);
        CREATE INDEX idx_bazi_conversations_month_day_pattern
          ON bazi_conversations(month_day_pattern_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(40, Date.now());
    });
    applyV40();
  }

  if (!applied.has(41)) {
    const applyV41 = db.transaction(() => {
      db.exec(`
        CREATE TABLE life_event_extraction_runs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          source_message_id TEXT NOT NULL,
          extractor_version TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
          candidate_count INTEGER NOT NULL DEFAULT 0,
          error_code TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER,

          UNIQUE (source_message_id, extractor_version),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE
        );

        CREATE TABLE life_event_candidates (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          source_message_id TEXT NOT NULL,
          candidate_key TEXT NOT NULL,
          extraction_version TEXT NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN (
            'education', 'career', 'finance', 'relationship', 'children',
            'relocation', 'family', 'health', 'achievement', 'custom'
          )),
          custom_category TEXT,
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT,
          date_precision TEXT NOT NULL CHECK (date_precision IN ('day', 'month', 'year', 'range', 'unknown')),
          description TEXT,
          impact_level INTEGER NOT NULL CHECK (impact_level BETWEEN 1 AND 5),
          confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
          source_excerpt TEXT NOT NULL,
          review_notes_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
          confirmed_event_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          confirmed_at INTEGER,
          dismissed_at INTEGER,

          UNIQUE (source_message_id, candidate_key, extraction_version),
          FOREIGN KEY (run_id) REFERENCES life_event_extraction_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE CASCADE,
          FOREIGN KEY (confirmed_event_id) REFERENCES life_events(id) ON DELETE SET NULL
        );

        CREATE INDEX idx_life_event_extraction_conversation
          ON life_event_extraction_runs(conversation_id, created_at DESC);
        CREATE INDEX idx_life_event_candidates_conversation_status
          ON life_event_candidates(conversation_id, status, created_at DESC);
        CREATE INDEX idx_life_event_candidates_source_message
          ON life_event_candidates(source_message_id, created_at ASC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(41, Date.now());
    });
    applyV41();
  }

  if (!applied.has(42)) {
    const applyV42 = db.transaction(() => {
      db.exec(`
        CREATE TABLE report_exports (
          id TEXT PRIMARY KEY,
          source_kind TEXT NOT NULL CHECK (source_kind IN ('topic', 'heming', 'annual', 'rectification')),
          source_report_id TEXT,
          source_transit_report_id TEXT,
          source_rectification_report_id TEXT,
          source_version_id TEXT NOT NULL,
          source_fingerprint TEXT NOT NULL,
          renderer_version TEXT NOT NULL,
          file_name TEXT NOT NULL,
          relative_path TEXT,
          mime_type TEXT NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf'),
          byte_size INTEGER CHECK (byte_size IS NULL OR byte_size > 0),
          sha256 TEXT,
          status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
          error_code TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER,

          UNIQUE (source_kind, source_version_id, source_fingerprint, renderer_version),
          CHECK (
            (source_report_id IS NOT NULL)
            + (source_transit_report_id IS NOT NULL)
            + (source_rectification_report_id IS NOT NULL) = 1
          ),
          CHECK (
            (source_kind IN ('topic', 'heming') AND source_report_id IS NOT NULL)
            OR (source_kind = 'annual' AND source_transit_report_id IS NOT NULL)
            OR (source_kind = 'rectification' AND source_rectification_report_id IS NOT NULL)
          ),
          FOREIGN KEY (source_report_id) REFERENCES reports(id) ON DELETE CASCADE,
          FOREIGN KEY (source_transit_report_id) REFERENCES transit_reports(id) ON DELETE CASCADE,
          FOREIGN KEY (source_rectification_report_id) REFERENCES rectification_reports(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_report_exports_source
          ON report_exports(source_kind, source_version_id, created_at DESC);
        CREATE INDEX idx_report_exports_status
          ON report_exports(status, updated_at DESC);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(42, Date.now());
    });
    applyV42();
  }

  if (!applied.has(43)) {
    const applyV43 = db.transaction(() => {
      db.exec(`
        ALTER TABLE report_versions
          ADD COLUMN generation_reason TEXT NOT NULL DEFAULT 'legacy_migration';
        ALTER TABLE report_versions
          ADD COLUMN base_version_id TEXT;

        ALTER TABLE rectification_report_versions
          ADD COLUMN generation_reason TEXT NOT NULL DEFAULT 'legacy_migration';
        ALTER TABLE rectification_report_versions
          ADD COLUMN base_version_id TEXT;

        ALTER TABLE transit_reports
          ADD COLUMN active_version_id TEXT;

        CREATE TABLE transit_report_versions (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_id TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          generation_reason TEXT NOT NULL,
          base_version_id TEXT,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
          error_code TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,

          UNIQUE (report_id, version),
          FOREIGN KEY (report_id)
            REFERENCES transit_reports(id)
            ON DELETE CASCADE,
          FOREIGN KEY (snapshot_id)
            REFERENCES transit_snapshots(id)
            ON DELETE CASCADE
        );

        INSERT INTO transit_report_versions (
          id, report_id, version, snapshot_id, engine_version, prompt_version,
          provider, model, generation_reason, base_version_id, content, status,
          error_code, input_tokens, output_tokens, created_at, completed_at
        )
        SELECT
          id || '-legacy-v1', id, 1, snapshot_id, engine_version, prompt_version,
          provider, model, 'legacy_migration', NULL, content, status,
          error_code, input_tokens, output_tokens, created_at, completed_at
        FROM transit_reports;

        UPDATE transit_reports
        SET active_version_id = id || '-legacy-v1'
        WHERE status = 'completed' AND content <> '';

        CREATE INDEX idx_transit_report_versions_report
          ON transit_report_versions(report_id, version DESC);
        CREATE INDEX idx_transit_report_versions_status
          ON transit_report_versions(report_id, status, created_at DESC);
        CREATE INDEX idx_report_versions_base
          ON report_versions(report_id, base_version_id);
        CREATE INDEX idx_rectification_report_versions_base
          ON rectification_report_versions(report_id, base_version_id);
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(43, Date.now());
    });
    applyV43();
  }

  if (!applied.has(44)) {
    const applyV44 = db.transaction(() => {
      db.exec(`
        CREATE TABLE report_user_revisions (
          id TEXT PRIMARY KEY,
          source_kind TEXT NOT NULL CHECK (source_kind IN ('topic', 'heming', 'annual', 'rectification')),
          source_report_id TEXT NOT NULL,
          source_version_id TEXT NOT NULL,
          source_version INTEGER NOT NULL CHECK (source_version > 0),
          review_status TEXT NOT NULL DEFAULT 'draft'
            CHECK (review_status IN ('draft', 'confirmed', 'needs_revision')),
          note TEXT NOT NULL DEFAULT '',
          edited_content_json TEXT,
          edit_revision INTEGER NOT NULL DEFAULT 0 CHECK (edit_revision >= 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          confirmed_at INTEGER,

          UNIQUE (source_kind, source_version_id),
          CHECK (review_status = 'confirmed' OR confirmed_at IS NULL)
        );

        CREATE INDEX idx_report_user_revisions_report
          ON report_user_revisions(source_kind, source_report_id, source_version DESC);
        CREATE INDEX idx_report_user_revisions_status
          ON report_user_revisions(review_status, updated_at DESC);

        CREATE TRIGGER report_user_revisions_delete_topic
        AFTER DELETE ON report_versions BEGIN
          DELETE FROM report_user_revisions
          WHERE source_kind IN ('topic', 'heming') AND source_version_id = old.id;
        END;

        CREATE TRIGGER report_user_revisions_delete_annual
        AFTER DELETE ON transit_report_versions BEGIN
          DELETE FROM report_user_revisions
          WHERE source_kind = 'annual' AND source_version_id = old.id;
        END;

        CREATE TRIGGER report_user_revisions_delete_rectification
        AFTER DELETE ON rectification_report_versions BEGIN
          DELETE FROM report_user_revisions
          WHERE source_kind = 'rectification' AND source_version_id = old.id;
        END;
      `);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(44, Date.now());
    });
    applyV44();
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

  db.prepare(`
    UPDATE bazi_messages
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
