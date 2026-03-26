import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import type { AgentType, ProviderSettings, ClaudeSettings, CodexSettings, GeminiSettings } from "@nexus/shared";
import { resolveCommand } from "../utils/resolve-command.js";

export interface ProviderRunOptions {
  provider: AgentType;
  prompt: string;
  cwd: string;
  settings?: ProviderSettings;
  onOutput: (chunk: string) => void;
  onExit: (exitCode: number) => void;
}

export interface ProviderRunHandle {
  stop: () => void;
}

const COMMANDS: Record<AgentType, string> = {
  claude: resolveCommand("claude"),
  codex: resolveCommand("codex"),
  gemini: resolveCommand("gemini"),
};

function buildArgs(provider: AgentType, prompt: string, cwd: string, outputFile?: string, settings?: ProviderSettings): string[] {
  switch (provider) {
    case "claude": {
      const s = (settings ?? {}) as ClaudeSettings;
      const args: string[] = ["-p", "--output-format", s.outputFormat ?? "text"];
      if (s.noSessionPersistence !== false) args.push("--no-session-persistence");
      if (s.model) args.push("--model", s.model);
      if (s.effort) args.push("--effort", s.effort);
      if (s.maxTurns !== undefined) args.push("--max-turns", String(s.maxTurns));
      if (s.maxBudgetUsd !== undefined) args.push("--max-budget-usd", String(s.maxBudgetUsd));
      if (s.permissionMode) args.push("--permission-mode", s.permissionMode);
      if (s.bare) args.push("--bare");
      args.push(prompt);
      return args;
    }
    case "codex": {
      const s = (settings ?? {}) as CodexSettings;
      const args: string[] = ["exec", "--skip-git-repo-check"];
      if (s.fullAuto !== false) args.push("--full-auto");
      if (s.approvalMode) args.push("--ask-for-approval", s.approvalMode);
      if (s.sandbox) args.push("--sandbox", s.sandbox);
      if (s.model) args.push("--model", s.model);
      if (s.reasoningEffort) args.push("--config", `model_reasoning_effort=${s.reasoningEffort}`);
      if (s.quiet) args.push("--quiet");
      if (s.json) args.push("--json");
      args.push("-C", cwd);
      if (outputFile) args.push("--output-last-message", outputFile);
      args.push(prompt);
      return args;
    }
    case "gemini": {
      const s = (settings ?? {}) as GeminiSettings;
      // Gemini: options MUST come before -p "prompt"
      const args: string[] = [];
      if (s.model) args.push("--model", s.model);
      if (s.temperature !== undefined) args.push("--temperature", String(s.temperature));
      if (s.approvalMode) args.push("--approval-mode", s.approvalMode);
      if (s.sandboxed) args.push("--sandbox");
      if (s.outputFormat) args.push("--output-format", s.outputFormat);
      if (s.yolo) args.push("--yolo");
      args.push("-p", prompt);
      return args;
    }
  }
}

export function runProvider(options: ProviderRunOptions): ProviderRunHandle {
  const outputFile =
    options.provider === "codex"
      ? join(tmpdir(), `nexus-codex-${Date.now()}.txt`)
      : undefined;

  const cmd = COMMANDS[options.provider];
  const args = buildArgs(options.provider, options.prompt, options.cwd, outputFile, options.settings);

  const proc: ChildProcess = spawn(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (data: Buffer) => {
    // For codex, stdout has the final message only; skip live output
    if (options.provider !== "codex") {
      options.onOutput(data.toString());
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    // Forward stderr for all providers — it contains auth errors, warnings, etc.
    options.onOutput(data.toString());
  });

  proc.on("exit", async (code) => {
    // For codex, read the output file for the final answer
    if (outputFile) {
      try {
        const content = await readFile(outputFile, "utf-8");
        if (content.trim()) {
          options.onOutput("\n" + content);
        }
      } catch {}
      try { await unlink(outputFile); } catch {}
    }
    options.onExit(code ?? 1);
  });

  proc.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      const installHint: Record<AgentType, string> = {
        claude: "npm install -g @anthropic-ai/claude-code",
        codex: "npm install -g @openai/codex",
        gemini: "npm install -g @google/gemini-cli",
      };
      const hint = installHint[options.provider] ?? `install ${options.provider}`;
      options.onOutput(`\x1b[31mError: ${options.provider} CLI not installed.\x1b[0m Install with:\n  ${hint}\n`);
    } else {
      options.onOutput(`\x1b[31mError: ${err.message}\x1b[0m\n`);
    }
    options.onExit(1);
  });

  return {
    stop: () => {
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
    },
  };
}
