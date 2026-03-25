import { getDb } from '../connection.js';

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  agent_id: string | null;
  provider: string | null;
  parent_message_id: string | null;
  status: string;
  token_count: number | null;
  duration_ms: number | null;
  created_at: string;
}

export const messageRepo = {
  create(data: {
    session_id: string;
    role: string;
    content: string;
    agent_id?: string;
    provider?: string;
    parent_message_id?: string;
  }): Message {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (id, session_id, role, content, agent_id, provider, parent_message_id, status, token_count, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)`
    ).run(
      id,
      data.session_id,
      data.role,
      data.content,
      data.agent_id ?? null,
      data.provider ?? null,
      data.parent_message_id ?? null,
      now
    );
    return this.findById(id) as Message;
  },

  findBySession(sessionId: string, limit = 100, offset = 0): Message[] {
    const db = getDb();
    return db.prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`
    ).all(sessionId, limit, offset) as Message[];
  },

  findById(id: string): Message | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Message | undefined;
  },

  updateContent(id: string, content: string): void {
    const db = getDb();
    db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, id);
  },

  updateStatus(id: string, status: string, extras?: { token_count?: number; duration_ms?: number }): void {
    const db = getDb();
    db.prepare(
      `UPDATE messages SET status = ?, token_count = ?, duration_ms = ? WHERE id = ?`
    ).run(
      status,
      extras?.token_count ?? null,
      extras?.duration_ms ?? null,
      id
    );
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
  },
};
