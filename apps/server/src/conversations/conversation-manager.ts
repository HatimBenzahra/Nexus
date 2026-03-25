import { EventEmitter } from "events";
import type {
  AgentType,
  ConversationCreateRequest,
  ConversationDetail,
  ConversationMessage,
  ConversationMessageRequest,
  ConversationSession,
  ProviderMode,
} from "@nexus/shared";
import { runProvider } from "../providers/provider-runner.js";

interface SessionRuntime {
  session: ConversationSession;
  messages: ConversationMessage[];
  activeRun?: {
    messageId: string;
    provider: AgentType;
    stop: () => void;
    idleTimer?: ReturnType<typeof setTimeout>;
  };
}

const ANSI_REGEX = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_REGEX = /\u001B\].*?(\u0007|\u001B\\)/g;

function normalizeTitle(input: string): string {
  return input.trim().slice(0, 60) || "New conversation";
}

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

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    const commonNoise = [
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
      /^\u25d0/,
    ];

    if (commonNoise.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    if (provider === "claude") {
      if (/^Not logged in/i.test(trimmed)) return false;
      if (/^Press enter/i.test(trimmed)) return false;
    }

    return true;
  });

  return filtered.join("\n");
}

function buildPrompt(entry: SessionRuntime, provider: AgentType, latestUserMessage: string): string {
  const history = entry.messages
    .filter((message) => message.role !== "system")
    .slice(-10)
    .map((message) => {
      const prefix = message.role === "assistant" ? `ASSISTANT (${message.provider || provider})` : "USER";
      return `${prefix}:\n${message.content.trim()}`;
    })
    .join("\n\n");

  return [
    `You are the ${provider} provider inside Nexus, a unified coding chat workspace.`,
    `Workspace: ${entry.session.projectPath}`,
    "Respond only with the assistant answer body.",
    "Do not print banners, prompts, status lines, terminal metadata, or repeat the user's message unless it is necessary.",
    "Keep continuity with the prior conversation transcript.",
    history ? `Conversation transcript:\n${history}` : "",
    `Latest user message:\n${latestUserMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

class ConversationManager extends EventEmitter {
  private sessions = new Map<string, SessionRuntime>();
  private sessionCounter = 0;
  private messageCounter = 0;

  listSessions(): ConversationSession[] {
    return Array.from(this.sessions.values())
      .map((entry) => entry.session)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSession(id: string): ConversationDetail | undefined {
    const entry = this.sessions.get(id);
    if (!entry) return undefined;

    return {
      session: entry.session,
      messages: entry.messages,
    };
  }

  createSession(req: ConversationCreateRequest): ConversationDetail {
    const now = new Date().toISOString();
    const id = `session-${++this.sessionCounter}-${Date.now()}`;
    const session: ConversationSession = {
      id,
      title: normalizeTitle(req.title || "New conversation"),
      projectPath: req.projectPath,
      defaultProvider: req.defaultProvider || "auto",
      createdAt: now,
      updatedAt: now,
    };

    const runtime: SessionRuntime = {
      session,
      messages: [
        {
          id: `message-${++this.messageCounter}-${Date.now()}`,
          sessionId: id,
          role: "system",
          content: `Workspace connected to ${req.projectPath}`,
          createdAt: now,
          status: "done",
        },
      ],
    };

    this.sessions.set(id, runtime);
    this.emit("session", session);

    return { session, messages: runtime.messages };
  }

  async addMessage(sessionId: string, req: ConversationMessageRequest): Promise<ConversationDetail> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Conversation not found: ${sessionId}`);
    }

    if (entry.activeRun) {
      throw new Error("A response is already streaming for this conversation");
    }

    const content = req.content.trim();
    if (!content) {
      throw new Error("Message content is required");
    }

    const now = new Date().toISOString();
    const provider = this.resolveProvider(req.provider || entry.session.defaultProvider);

    const userMessage: ConversationMessage = {
      id: `message-${++this.messageCounter}-${Date.now()}`,
      sessionId,
      role: "user",
      content,
      createdAt: now,
      status: "done",
    };

    const assistantMessage: ConversationMessage = {
      id: `message-${++this.messageCounter}-${Date.now()}`,
      sessionId,
      role: "assistant",
      content: "",
      provider,
      createdAt: now,
      status: "streaming",
    };

    entry.messages.push(userMessage, assistantMessage);
    entry.session.updatedAt = now;
    if (entry.messages.filter((message) => message.role === "user").length === 1) {
      entry.session.title = normalizeTitle(content);
    }

    this.emit("message", userMessage);
    this.emit("message", assistantMessage);
    this.emit("session", entry.session);

    const prompt = buildPrompt(entry, provider, content);

    try {
      const handle = runProvider({
        provider,
        prompt,
        cwd: entry.session.projectPath,
        onOutput: (chunk) => this.handleProviderOutput(entry, assistantMessage.id, provider, chunk),
        onExit: (exitCode) => this.handleProviderExit(entry, assistantMessage.id, exitCode),
      });

      entry.activeRun = {
        messageId: assistantMessage.id,
        provider,
        stop: handle.stop,
      };
    } catch (error) {
      assistantMessage.status = "error";
      assistantMessage.content = (error as Error).message;
      this.emit("message", assistantMessage);
    }

    return { session: entry.session, messages: entry.messages };
  }

  private resolveProvider(provider: ProviderMode): AgentType {
    if (provider === "auto") {
      return "claude";
    }

    return provider;
  }

  private handleProviderOutput(
    entry: SessionRuntime,
    messageId: string,
    provider: AgentType,
    raw: string,
  ) {
    const message = entry.messages.find((item) => item.id === messageId);
    if (!message || entry.activeRun?.messageId !== messageId) {
      return;
    }

    const chunk = sanitizeProviderChunk(provider, raw);
    if (!chunk.trim()) {
      return;
    }

    message.content += chunk;
    message.status = "streaming";
    entry.session.updatedAt = new Date().toISOString();
    this.emit("message", message);
    this.emit("session", entry.session);
    this.scheduleRunCompletion(entry);
  }

  private handleProviderExit(entry: SessionRuntime, messageId: string, exitCode: number) {
    const message = entry.messages.find((item) => item.id === messageId);
    if (!message || entry.activeRun?.messageId !== messageId) {
      return;
    }

    message.content = message.content.trim();
    if (!message.content) {
      message.status = "error";
      message.content = exitCode === 0
        ? "No response was produced by the provider."
        : `Provider exited with code ${exitCode}.`;
    } else if (exitCode !== 0) {
      message.status = "error";
    } else if (message.status !== "error") {
      message.status = "done";
    }

    this.finishRun(entry);
    this.emit("message", message);
  }

  private scheduleRunCompletion(entry: SessionRuntime) {
    if (!entry.activeRun) {
      return;
    }

    clearTimeout(entry.activeRun.idleTimer);
    entry.activeRun.idleTimer = setTimeout(() => {
      const message = entry.messages.find((item) => item.id === entry.activeRun?.messageId);
      if (message && message.status === "streaming") {
        message.content = message.content.trim();
        message.status = message.content ? "done" : "error";
        if (!message.content) {
          message.content = "No response was produced by the provider.";
        }
        this.emit("message", message);
      }
      this.finishRun(entry);
    }, 1200);
  }

  private finishRun(entry: SessionRuntime) {
    if (!entry.activeRun) {
      return;
    }

    clearTimeout(entry.activeRun.idleTimer);
    entry.activeRun = undefined;
    entry.session.updatedAt = new Date().toISOString();
    this.emit("session", entry.session);
  }
}

export const conversationManager = new ConversationManager();
