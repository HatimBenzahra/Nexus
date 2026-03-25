import type { AgentType } from "@nexus/shared";
import { execSync } from "child_process";

interface AgentInfo {
  type: AgentType;
  label: string;
  description: string;
  installed: boolean;
  version?: string;
}

function checkInstalled(command: string): { installed: boolean; version?: string } {
  try {
    const output = execSync(`which ${command}`, { encoding: "utf-8" }).trim();
    if (!output) return { installed: false };
    try {
      const version = execSync(`${command} --version 2>/dev/null || echo unknown`, {
        encoding: "utf-8",
      }).trim();
      return { installed: true, version };
    } catch {
      return { installed: true };
    }
  } catch {
    return { installed: false };
  }
}

export function getAvailableAgents(): AgentInfo[] {
  return [
    {
      type: "claude",
      label: "Claude Code",
      description: "Anthropic's CLI coding agent",
      ...checkInstalled("claude"),
    },
    {
      type: "codex",
      label: "Codex CLI",
      description: "OpenAI's CLI coding agent",
      ...checkInstalled("codex"),
    },
    {
      type: "gemini",
      label: "Gemini CLI",
      description: "Google's CLI coding agent",
      ...checkInstalled("gemini"),
    },
  ];
}
