import type { SubagentConfig, SubagentCreateRequest } from "@nexus/shared";

class SubagentManager {
  private subagents = new Map<string, SubagentConfig>();
  private counter = 0;

  list(): SubagentConfig[] {
    return Array.from(this.subagents.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  create(req: SubagentCreateRequest): SubagentConfig {
    if (!req.name.trim()) {
      throw new Error("Subagent name is required");
    }

    const now = new Date().toISOString();
    const subagent: SubagentConfig = {
      id: `subagent-${++this.counter}-${Date.now()}`,
      name: req.name.trim(),
      provider: req.provider,
      systemPrompt: req.systemPrompt.trim(),
      color: req.color,
      createdAt: now,
    };

    this.subagents.set(subagent.id, subagent);
    return subagent;
  }

  delete(id: string) {
    if (!this.subagents.has(id)) {
      throw new Error(`Subagent not found: ${id}`);
    }

    this.subagents.delete(id);
  }
}

export const subagentManager = new SubagentManager();
