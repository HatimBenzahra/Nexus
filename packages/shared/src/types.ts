export type AgentType = "claude" | "codex" | "gemini";
export type ProviderMode = AgentType | "auto";

export type AgentStatus = "idle" | "running" | "error" | "done";

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  projectPath: string;
  worktreePath?: string;
  worktreeBranch?: string;
  status: AgentStatus;
  createdAt: string;
  pid?: number;
}

export interface AgentCreateRequest {
  name: string;
  type: AgentType;
  projectPath: string;
  useWorktree?: boolean;
  hidden?: boolean;
}

export interface ConversationSession {
  id: string;
  title: string;
  projectPath: string;
  defaultProvider: ProviderMode;
  createdAt: string;
  updatedAt: string;
}

export type ConversationRole = "user" | "assistant" | "system";
export type ConversationMessageStatus = "streaming" | "done" | "error";

export interface ConversationMessage {
  id: string;
  sessionId?: string;
  role: ConversationRole;
  content: string;
  provider?: AgentType;
  status?: ConversationMessageStatus;
  createdAt: string;
}

export interface ChatRequest {
  provider: AgentType;
  messages: ConversationMessage[];
  cwd?: string;
}

export interface ChatResponse {
  message: ConversationMessage;
}

export interface ConversationCreateRequest {
  title?: string;
  projectPath: string;
  defaultProvider?: ProviderMode;
}

export interface ConversationMessageRequest {
  content: string;
  provider?: ProviderMode;
}

export interface ConversationDetail {
  session: ConversationSession;
  messages: ConversationMessage[];
}

export interface SubagentConfig {
  id: string;
  name: string;
  provider: AgentType;
  systemPrompt: string;
  color?: string;
  createdAt: string;
}

export interface SubagentCreateRequest {
  name: string;
  provider: AgentType;
  systemPrompt: string;
  color?: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpServerStatus extends McpServerConfig {
  healthy: boolean;
  lastChecked?: string;
  error?: string;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: WorkspaceFile[];
}

export interface DiffEntry {
  filePath: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface ClaudeSettings {
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  systemPrompt?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  outputFormat?: "text" | "json" | "stream-json";
  permissionMode?: "default" | "plan" | "auto" | "bypassPermissions";
  bare?: boolean;
  noSessionPersistence?: boolean;
}

export interface CodexSettings {
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  approvalMode?: "untrusted" | "on-request" | "never";
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  fullAuto?: boolean;
  json?: boolean;
  quiet?: boolean;
  provider?: string;
}

export interface GeminiSettings {
  model?: string;
  temperature?: number;
  approvalMode?: "default" | "auto_edit" | "yolo" | "plan";
  sandboxed?: boolean;
  outputFormat?: "text" | "json";
  yolo?: boolean;
}

export type ProviderSettings = ClaudeSettings | CodexSettings | GeminiSettings;

