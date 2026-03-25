import { EventEmitter } from "events";
import type { AgentConfig, AgentCreateRequest } from "@nexus/shared";
import { AGENT_CLI_COMMANDS } from "@nexus/shared";
import { ProcessWrapper } from "./process-wrapper.js";

const MAX_BUFFER = 100_000; // chars

class AgentManager extends EventEmitter {
  private agents = new Map<string, { config: AgentConfig; process: ProcessWrapper; outputBuffer: string }>();
  private counter = 0;

  createAgent(req: AgentCreateRequest): AgentConfig {
    const id = `agent-${++this.counter}-${Date.now()}`;
    const cliDef = AGENT_CLI_COMMANDS[req.type];
    if (!cliDef) {
      throw new Error(`Unknown agent type: ${req.type}`);
    }

    const config: AgentConfig = {
      id,
      name: req.name || `${req.type}-${this.counter}`,
      type: req.type,
      projectPath: req.projectPath,
      status: "idle",
      createdAt: new Date().toISOString(),
    };

    const proc = new ProcessWrapper(cliDef.command, cliDef.defaultArgs, req.projectPath);
    const entry = { config, process: proc, outputBuffer: "" };
    this.agents.set(id, entry);

    proc.on("output", (data: string) => {
      // Buffer output so late-joining clients can see history
      entry.outputBuffer += data;
      if (entry.outputBuffer.length > MAX_BUFFER) {
        entry.outputBuffer = entry.outputBuffer.slice(-MAX_BUFFER);
      }
      this.emit("output", id, data);
    });

    proc.on("exit", (code: number) => {
      config.status = code === 0 ? "done" : "error";
      this.emit("status", id, config.status, code);
    });

    proc.start();
    config.status = "running";
    config.pid = proc.pid;
    this.emit("status", id, "running");

    return config;
  }

  stopAgent(id: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error(`Agent not found: ${id}`);

    entry.process.stop();
    entry.config.status = "done";
    this.emit("status", id, "done");
    this.agents.delete(id);
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id)?.config;
  }

  getOutputBuffer(id: string): string {
    return this.agents.get(id)?.outputBuffer || "";
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map((e) => e.config);
  }

  sendInput(id: string, data: string) {
    const entry = this.agents.get(id);
    if (!entry) throw new Error(`Agent not found: ${id}`);
    entry.process.write(data);
  }
}

export const agentManager = new AgentManager();
