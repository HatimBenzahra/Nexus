import { getDb } from '../connection.js';

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  role: string;
  provider: string;
  system_prompt: string | null;
  parent_agent_id: string | null;
  color: string | null;
  config_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const agentRepo = {
  create(data: {
    workspace_id: string;
    name: string;
    role: string;
    provider: string;
    system_prompt?: string;
    parent_agent_id?: string;
    color?: string;
    config_json?: string;
  }): Agent {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agents (id, workspace_id, name, role, provider, system_prompt, parent_agent_id, color, config_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)`
    ).run(
      id,
      data.workspace_id,
      data.name,
      data.role,
      data.provider,
      data.system_prompt ?? null,
      data.parent_agent_id ?? null,
      data.color ?? null,
      data.config_json ?? null,
      now,
      now
    );
    return this.findById(id) as Agent;
  },

  findById(id: string): Agent | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as Agent | undefined;
  },

  findByWorkspace(workspaceId: string): Agent[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId) as Agent[];
  },

  findChildren(parentId: string): Agent[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM agents WHERE parent_agent_id = ? ORDER BY created_at DESC`).all(parentId) as Agent[];
  },

  update(id: string, data: Partial<Agent>): Agent {
    const db = getDb();
    const now = new Date().toISOString();
    const allowed: (keyof Agent)[] = ['name', 'role', 'provider', 'system_prompt', 'parent_agent_id', 'color', 'config_json', 'status'];
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
    db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id) as Agent;
  },

  updateStatus(id: string, status: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id);
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  },
};
