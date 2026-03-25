import { getDb } from '../connection.js';

export interface Memory {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  source: string | null;
  relevance: number;
  accessed_at: string;
  created_at: string;
}

export const memoryRepo = {
  create(data: { agent_id: string; type: string; content: string; source?: string }): Memory {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agent_memories (id, agent_id, type, content, source, relevance, accessed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1.0, ?, ?)`
    ).run(id, data.agent_id, data.type, data.content, data.source ?? null, now, now);
    return this.findById(id) as Memory;
  },

  findByAgent(agentId: string, type?: string, limit = 100): Memory[] {
    const db = getDb();
    if (type) {
      return db.prepare(
        `SELECT * FROM agent_memories WHERE agent_id = ? AND type = ? ORDER BY relevance DESC, accessed_at DESC LIMIT ?`
      ).all(agentId, type, limit) as Memory[];
    }
    return db.prepare(
      `SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY relevance DESC, accessed_at DESC LIMIT ?`
    ).all(agentId, limit) as Memory[];
  },

  findById(id: string): Memory | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM agent_memories WHERE id = ?`).get(id) as Memory | undefined;
  },

  updateRelevance(id: string, relevance: number): void {
    const db = getDb();
    db.prepare(`UPDATE agent_memories SET relevance = ? WHERE id = ?`).run(relevance, id);
  },

  touch(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`UPDATE agent_memories SET accessed_at = ? WHERE id = ?`).run(now, id);
  },

  decayAll(agentId: string, factor = 0.9): void {
    const db = getDb();
    db.prepare(`UPDATE agent_memories SET relevance = relevance * ? WHERE agent_id = ?`).run(factor, agentId);
  },

  prune(agentId: string, minRelevance = 0.1): number {
    const db = getDb();
    const result = db.prepare(
      `DELETE FROM agent_memories WHERE agent_id = ? AND relevance < ?`
    ).run(agentId, minRelevance);
    return result.changes;
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM agent_memories WHERE id = ?`).run(id);
  },
};
