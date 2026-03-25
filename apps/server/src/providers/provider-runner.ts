import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import type { AgentType } from "@nexus/shared";
import { resolveCommand } from "../utils/resolve-command.js";

export interface ProviderRunOptions {
  provider: AgentType;
  prompt: string;
  cwd: string;
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

function buildArgs(provider: AgentType, prompt: string, cwd: string, outputFile?: string): string[] {
  switch (provider) {
    case "claude":
      return ["-p", "--output-format", "text", "--no-session-persistence", prompt];
    case "codex":
      return [
        "exec",
        "--skip-git-repo-check",
        "--full-auto",
        "-C", cwd,
        ...(outputFile ? ["-o", outputFile] : []),
        prompt,
      ];
    case "gemini":
      return ["-p", prompt];
  }
}

export function runProvider(options: ProviderRunOptions): ProviderRunHandle {
  const outputFile =
    options.provider === "codex"
      ? join(tmpdir(), `nexus-codex-${Date.now()}.txt`)
      : undefined;

  const cmd = COMMANDS[options.provider];
  const args = buildArgs(options.provider, options.prompt, options.cwd, outputFile);

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
