import { getDb } from '../connection.js';

export interface CanvasNode {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string | null;
  label: string;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdge {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
  created_at: string;
}

export const canvasRepo = {
  createNode(data: {
    workspace_id: string;
    entity_type: string;
    entity_id?: string;
    label: string;
    x?: number;
    y?: number;
  }): CanvasNode {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO canvas_nodes (id, workspace_id, entity_type, entity_id, label, x, y, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.workspace_id,
      data.entity_type,
      data.entity_id ?? null,
      data.label,
      data.x ?? 0,
      data.y ?? 0,
      now,
      now
    );
    return db.prepare(`SELECT * FROM canvas_nodes WHERE id = ?`).get(id) as CanvasNode;
  },

  createEdge(data: {
    workspace_id: string;
    source_node_id: string;
    target_node_id: string;
    edge_type?: string;
    label?: string;
  }): CanvasEdge {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO canvas_edges (id, workspace_id, source_node_id, target_node_id, edge_type, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.workspace_id,
      data.source_node_id,
      data.target_node_id,
      data.edge_type ?? null,
      data.label ?? null,
      now
    );
    return db.prepare(`SELECT * FROM canvas_edges WHERE id = ?`).get(id) as CanvasEdge;
  },

  getNodes(workspaceId: string): CanvasNode[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM canvas_nodes WHERE workspace_id = ?`).all(workspaceId) as CanvasNode[];
  },

  getEdges(workspaceId: string): CanvasEdge[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM canvas_edges WHERE workspace_id = ?`).all(workspaceId) as CanvasEdge[];
  },

  updateNode(id: string, data: Partial<CanvasNode>): CanvasNode {
    const db = getDb();
    const now = new Date().toISOString();
    const allowed: (keyof CanvasNode)[] = ['entity_type', 'entity_id', 'label', 'x', 'y'];
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
    db.prepare(`UPDATE canvas_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare(`SELECT * FROM canvas_nodes WHERE id = ?`).get(id) as CanvasNode;
  },

  removeNode(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM canvas_nodes WHERE id = ?`).run(id);
  },

  removeEdge(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM canvas_edges WHERE id = ?`).run(id);
  },
};
