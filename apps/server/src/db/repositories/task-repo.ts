import { getDb } from '../connection.js';

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  created_by: string | null;
  assigned_to: string | null;
  session_id: string | null;
  parent_task_id: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export const taskRepo = {
  create(data: {
    workspace_id: string;
    title: string;
    description?: string;
    created_by?: string;
    assigned_to?: string;
    session_id?: string;
    parent_task_id?: string;
    priority?: number;
  }): Task {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, workspace_id, title, description, status, priority, created_by, assigned_to, session_id, parent_task_id, result, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      id,
      data.workspace_id,
      data.title,
      data.description ?? null,
      data.priority ?? 0,
      data.created_by ?? null,
      data.assigned_to ?? null,
      data.session_id ?? null,
      data.parent_task_id ?? null,
      now,
      now
    );
    return this.findById(id) as Task;
  },

  findById(id: string): Task | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Task | undefined;
  },

  findByWorkspace(workspaceId: string, filters?: { status?: string; assigned_to?: string }): Task[] {
    const db = getDb();
    const conditions = ['workspace_id = ?'];
    const values: unknown[] = [workspaceId];
    if (filters?.status) { conditions.push('status = ?'); values.push(filters.status); }
    if (filters?.assigned_to) { conditions.push('assigned_to = ?'); values.push(filters.assigned_to); }
    return db.prepare(
      `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY priority DESC, created_at DESC`
    ).all(...values) as Task[];
  },

  findChildren(parentId: string): Task[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at DESC`).all(parentId) as Task[];
  },

  update(id: string, data: Partial<Task>): Task {
    const db = getDb();
    const now = new Date().toISOString();
    const allowed: (keyof Task)[] = ['title', 'description', 'status', 'priority', 'created_by', 'assigned_to', 'session_id', 'parent_task_id', 'result'];
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
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id) as Task;
  },

  updateStatus(id: string, status: string, result?: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`UPDATE tasks SET status = ?, result = ?, updated_at = ? WHERE id = ?`).run(status, result ?? null, now, id);
  },

  addDependency(taskId: string, dependsOnId: string): void {
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)`).run(taskId, dependsOnId);
  },

  removeDependency(taskId: string, dependsOnId: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?`).run(taskId, dependsOnId);
  },

  getDependencies(taskId: string): Task[] {
    const db = getDb();
    return db.prepare(
      `SELECT t.* FROM tasks t
       JOIN task_dependencies td ON t.id = td.depends_on_id
       WHERE td.task_id = ?`
    ).all(taskId) as Task[];
  },

  getDependents(taskId: string): Task[] {
    const db = getDb();
    return db.prepare(
      `SELECT t.* FROM tasks t
       JOIN task_dependencies td ON t.id = td.task_id
       WHERE td.depends_on_id = ?`
    ).all(taskId) as Task[];
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  },
};
