import { randomUUID } from 'node:crypto';
import type { LearningNote } from '@/lib/learning/types';
import { getDatabase } from './client';

interface LearningNoteRow {
  id: string;
  conversation_id: string;
  knowledge_point_id: string;
  palace_branch: number;
  content: string;
  created_at: number;
  updated_at: number;
}

function mapNote(row: LearningNoteRow): LearningNote {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    knowledgePointId: row.knowledge_point_id,
    palaceBranch: row.palace_branch,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getLearningNote(input: {
  conversationId: string;
  knowledgePointId: string;
  palaceBranch: number;
}): LearningNote | null {
  const row = getDatabase().prepare(`
    SELECT * FROM learning_notes
    WHERE conversation_id = ? AND knowledge_point_id = ? AND palace_branch = ?
  `).get(input.conversationId, input.knowledgePointId, input.palaceBranch) as LearningNoteRow | undefined;
  return row ? mapNote(row) : null;
}

export function saveLearningNote(input: {
  conversationId: string;
  knowledgePointId: string;
  palaceBranch: number;
  content: string;
}): LearningNote | null {
  const db = getDatabase();
  const content = input.content.trim();
  const existing = getLearningNote(input);
  if (!content) {
    if (existing) db.prepare('DELETE FROM learning_notes WHERE id = ?').run(existing.id);
    return null;
  }
  if (content.length > 4_000) throw new Error('学习笔记不能超过 4000 个字符');
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE learning_notes SET content = ?, updated_at = ? WHERE id = ?')
      .run(content, now, existing.id);
    return getLearningNote(input);
  }
  db.prepare(`
    INSERT INTO learning_notes (
      id, conversation_id, knowledge_point_id, palace_branch, content, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.conversationId, input.knowledgePointId, input.palaceBranch, content, now, now);
  return getLearningNote(input);
}

export function listLearningNotes(conversationId: string): LearningNote[] {
  return (getDatabase().prepare(`
    SELECT * FROM learning_notes WHERE conversation_id = ? ORDER BY updated_at DESC
  `).all(conversationId) as LearningNoteRow[]).map(mapNote);
}
