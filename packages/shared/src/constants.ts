import type { AgentType } from "./types.js";

export const AGENT_CLI_COMMANDS: Record<AgentType, { command: string; defaultArgs: string[] }> = {
  claude: {
    command: "claude",
    defaultArgs: [],
  },
  codex: {
    command: "codex",
    defaultArgs: [],
  },
  gemini: {
    command: "gemini",
    defaultArgs: [],
  },
};

export const DEFAULT_PORTS = {
  web: 3000,
  server: 3001,
  ws: 3001,
} as const;

export const TERMINAL_CONFIG = {
  maxScrollback: 10_000,
  throttleMs: 16,
} as const;
