import { getDb } from '../connection.js';

export interface Session {
  id: string;
  workspace_id: string;
  title: string | null;
  primary_agent_id: string | null;
  parent_session_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionParticipant {
  agent_id: string;
  role: string;
  joined_at: string;
}

export const sessionRepo = {
  create(data: {
    workspace_id: string;
    title?: string;
    primary_agent_id?: string;
    parent_session_id?: string;
  }): Session {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sessions (id, workspace_id, title, primary_agent_id, parent_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(
      id,
      data.workspace_id,
      data.title ?? '',
      data.primary_agent_id ?? null,
      data.parent_session_id ?? null,
      now,
      now
    );
    return this.findById(id) as Session;
  },

  findById(id: string): Session | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Session | undefined;
  },

  findByWorkspace(workspaceId: string): Session[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId) as Session[];
  },

  findChildren(parentId: string): Session[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM sessions WHERE parent_session_id = ? ORDER BY created_at DESC`).all(parentId) as Session[];
  },

  addParticipant(sessionId: string, agentId: string, role = 'participant'): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO session_participants (session_id, agent_id, role, joined_at)
       VALUES (?, ?, ?, ?)`
    ).run(sessionId, agentId, role, now);
  },

  removeParticipant(sessionId: string, agentId: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM session_participants WHERE session_id = ? AND agent_id = ?`).run(sessionId, agentId);
  },

  getParticipants(sessionId: string): SessionParticipant[] {
    const db = getDb();
    return db.prepare(
      `SELECT agent_id, role, joined_at FROM session_participants WHERE session_id = ? ORDER BY joined_at ASC`
    ).all(sessionId) as SessionParticipant[];
  },

  update(id: string, data: Partial<Session>): Session {
    const db = getDb();
    const now = new Date().toISOString();
    const allowed: (keyof Session)[] = ['title', 'primary_agent_id', 'parent_session_id', 'status'];
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in data) {
        fields.push(`${key} = ?`);
        values.push(data[key] ?? null);
      }
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id) as Session;
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  },
};
