PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  provider        TEXT NOT NULL CHECK (provider IN ('claude', 'codex', 'gemini')),
  system_prompt   TEXT,
  color           TEXT,
  status          TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'error', 'done', 'archived')),
  config_json     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  primary_agent_id  TEXT REFERENCES agents(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  metadata_json     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS session_participants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  joined_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (session_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id          TEXT REFERENCES agents(id) ON DELETE SET NULL,
  parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content           TEXT NOT NULL,
  provider          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'streaming', 'done', 'error', 'cancelled')),
  token_count       INTEGER,
  duration_ms       INTEGER,
  metadata_json     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id    TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  assigned_to   TEXT REFERENCES agents(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'review', 'completed', 'failed', 'cancelled')),
  priority      INTEGER NOT NULL DEFAULT 0,
  result        TEXT,
  metadata_json TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id != depends_on_id)
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('fact', 'episode', 'directive')),
  content    TEXT NOT NULL,
  source     TEXT,
  relevance  REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  accessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('agent', 'task', 'session', 'note', 'group')),
  entity_id   TEXT,
  label       TEXT NOT NULL,
  x           REAL NOT NULL DEFAULT 0,
  y           REAL NOT NULL DEFAULT 0,
  width       REAL NOT NULL DEFAULT 200,
  height      REAL NOT NULL DEFAULT 100,
  color       TEXT,
  collapsed   INTEGER NOT NULL DEFAULT 0,
  style_json  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  edge_type      TEXT NOT NULL DEFAULT 'default' CHECK (edge_type IN ('default', 'delegation', 'dependency', 'communication', 'hierarchy')),
  label          TEXT,
  style_json     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id            TEXT PRIMARY KEY,
  from_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  content       TEXT NOT NULL,
  message_type  TEXT NOT NULL CHECK (message_type IN ('request', 'response', 'notification', 'handoff')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'actioned')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Indexes on foreign keys and commonly queried columns

-- agents
CREATE INDEX IF NOT EXISTS idx_agents_workspace_id    ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_parent_agent_id ON agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_status          ON agents(status);

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id      ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_primary_agent_id  ON sessions(primary_agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status            ON sessions(status);

-- session_participants
CREATE INDEX IF NOT EXISTS idx_session_participants_agent_id ON session_participants(agent_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_session_id        ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent_id          ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_message_id ON messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_role              ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_status            ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at        ON messages(created_at);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id   ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id     ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by     ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to    ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority       ON tasks(priority);

-- task_dependencies
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id);

-- agent_memories
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id    ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type        ON agent_memories(type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_relevance   ON agent_memories(relevance);
CREATE INDEX IF NOT EXISTS idx_agent_memories_accessed_at ON agent_memories(accessed_at);

-- canvas_nodes
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace_id ON canvas_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_entity_type  ON canvas_nodes(entity_type);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_entity_id    ON canvas_nodes(entity_id);

-- canvas_edges
CREATE INDEX IF NOT EXISTS idx_canvas_edges_workspace_id   ON canvas_edges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_source_node_id ON canvas_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_target_node_id ON canvas_edges(target_node_id);

-- agent_messages
CREATE INDEX IF NOT EXISTS idx_agent_messages_from_agent_id ON agent_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to_agent_id   ON agent_messages(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task_id       ON agent_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_status        ON agent_messages(status);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at    ON agent_messages(created_at);
