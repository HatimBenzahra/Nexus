import { getDb } from '../connection.js';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export const workspaceRepo = {
  create(data: { name: string; path: string }): Workspace {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workspaces (id, name, path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, data.name, data.path, now, now);
    return this.findById(id) as Workspace;
  },

  findById(id: string): Workspace | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as Workspace | undefined;
  },

  findByPath(path: string): Workspace | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM workspaces WHERE path = ?`).get(path) as Workspace | undefined;
  },

  findAll(): Workspace[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM workspaces ORDER BY created_at DESC`).all() as Workspace[];
  },

  update(id: string, data: Partial<{ name: string; path: string }>): Workspace {
    const db = getDb();
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.path !== undefined) { fields.push('path = ?'); values.push(data.path); }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    db.prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id) as Workspace;
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
  },
};
