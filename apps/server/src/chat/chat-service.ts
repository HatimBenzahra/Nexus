import type { AgentType, ChatRequest, ChatResponse, ConversationMessage } from "@nexus/shared";
import { runProvider } from "../providers/provider-runner.js";

const ANSI_REGEX = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_REGEX = /\u001B\].*?(\u0007|\u001B\\)/g;

function cleanOutput(chunk: string): string {
  return chunk
    .replace(OSC_REGEX, "")
    .replace(ANSI_REGEX, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function sanitizeProviderChunk(provider: AgentType, chunk: string): string {
  const cleaned = cleanOutput(chunk);
  const lines = cleaned.split("\n");

  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      const noise = [
        /^▐/,
        /^▝/,
        /^❯/,
        /^>/,
        /^\[>[0-9;?]+[A-Za-z]/,
        /^\[<[0-9;?]+[A-Za-z]/,
        /^\[OMC#?/,
        /^\/Users\//,
        /^~\//,
        /^OpenAI Codex/i,
        /^Claude Code/i,
        /^Gemini CLI/i,
        /^Opus/i,
        /^Sonnet/i,
        /^medium\s·/i,
      ];

      if (noise.some((pattern) => pattern.test(trimmed))) {
        return false;
      }

      return true;
    })
    .join("\n");
}

function buildPrompt(messages: ConversationMessage[], provider: AgentType): string {
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content.trim()}`)
    .join("\n\n");

  return [
    `You are the ${provider} model inside Nexus.`,
    "Continue this chat naturally.",
    "Reply only with the assistant answer.",
    "Do not include banners, prompts, status lines, markdown code fences unless needed, or terminal metadata.",
    `Transcript:\n${transcript}`,
  ].join("\n\n");
}

export async function runChat(request: ChatRequest): Promise<ChatResponse> {
  const message: ConversationMessage = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: "",
    provider: request.provider,
    createdAt: new Date().toISOString(),
  };

  const prompt = buildPrompt(request.messages, request.provider);

  await new Promise<void>((resolve) => {
    runProvider({
      provider: request.provider,
      prompt,
      cwd: request.cwd || process.cwd(),
      onOutput: (chunk) => {
        message.content += sanitizeProviderChunk(request.provider, chunk);
      },
      onExit: (exitCode) => {
        message.content = message.content.trim();
        message.status = exitCode === 0 ? "done" : "error";
        if (!message.content) {
          message.content = exitCode === 0
            ? "No response was produced by the provider."
            : `Provider exited with code ${exitCode}.`;
        }
        resolve();
      },
    });
  });

  return { message };
}
