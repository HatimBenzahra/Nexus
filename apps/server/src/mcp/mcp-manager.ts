import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { McpServerConfig, McpServerStatus } from "@nexus/shared";
import { spawn } from "child_process";

const CLAUDE_CONFIG_PATH = join(homedir(), ".claude.json");

interface ClaudeConfig {
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

class McpManager {
  private async readConfig(): Promise<ClaudeConfig> {
    try {
      const raw = await readFile(CLAUDE_CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeConfig(config: ClaudeConfig): Promise<void> {
    await writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  }

  async listServers(): Promise<McpServerStatus[]> {
    const config = await this.readConfig();
    const servers = config.mcpServers || {};

    return Object.entries(servers).map(([name, srv]) => ({
      name,
      command: srv.command,
      args: srv.args || [],
      env: srv.env,
      enabled: true,
      healthy: false,
    }));
  }

  async addServer(server: McpServerConfig): Promise<void> {
    if (!server.name || !server.command) {
      throw new Error("name and command are required");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(server.name)) {
      throw new Error("name must be alphanumeric (letters, numbers, underscores, hyphens only)");
    }
    const dangerousPatterns = /\b(rm|sudo|dd|mkfs|chmod|chown|mv|cp|wget|curl|bash|sh|zsh|python|perl|ruby|node|exec|eval)\b/i;
    if (dangerousPatterns.test(server.command)) {
      throw new Error("command contains a disallowed term");
    }
    const config = await this.readConfig();
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[server.name] = {
      command: server.command,
      args: server.args || [],
      env: server.env,
    };
    await this.writeConfig(config);
  }

  async removeServer(name: string): Promise<void> {
    const config = await this.readConfig();
    if (!config.mcpServers?.[name]) {
      throw new Error(`MCP server not found: ${name}`);
    }
    delete config.mcpServers[name];
    await this.writeConfig(config);
  }

  async healthCheck(name: string): Promise<McpServerStatus> {
    const config = await this.readConfig();
    const srv = config.mcpServers?.[name];
    if (!srv) throw new Error(`MCP server not found: ${name}`);

    const status: McpServerStatus = {
      name,
      command: srv.command,
      args: srv.args || [],
      env: srv.env,
      enabled: true,
      healthy: false,
      lastChecked: new Date().toISOString(),
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(srv.command, ["--help"], {
          timeout: 5000,
          stdio: "pipe",
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0 || code === null) resolve();
          else reject(new Error(`Exit code: ${code}`));
        });
      });
      status.healthy = true;
    } catch (err) {
      status.error = (err as Error).message;
    }

    return status;
  }
}

export const mcpManager = new McpManager();
