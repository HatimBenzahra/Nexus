import type { WebSocketServer } from "ws";
import { runProvider, type ProviderRunHandle } from "../providers/provider-runner.js";
import { homedir } from "os";
import { basename } from "path";
import type { AgentType } from "@nexus/shared";
import { workspaceRepo, sessionRepo, messageRepo } from "../db/repositories/index.js";
import { getDb } from "../db/connection.js";

interface WsMsg {
  type: "chat" | "stop" | "load-session" | "list-sessions";
  model?: AgentType;
  message?: string;
  cwd?: string;
  sessionId?: string;
}

function getOrCreateWorkspace(cwd: string) {
  let ws = workspaceRepo.findByPath(cwd);
  if (!ws) {
    ws = workspaceRepo.create({ name: basename(cwd), path: cwd });
  }
  return ws;
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    let handle: ProviderRunHandle | null = null;
    let cwd = homedir();
    let currentSessionId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg: WsMsg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "chat": {
            if (!msg.model || !msg.message) break;
            if (msg.cwd) cwd = msg.cwd;

            // Stop any running process
            if (handle) {
              handle.stop();
              handle = null;
            }

            // Determine session: use provided sessionId or create a new one
            let sessionId = msg.sessionId ?? currentSessionId;
            if (!sessionId) {
              const workspace = getOrCreateWorkspace(cwd);
              const title = msg.message.slice(0, 80);
              const session = sessionRepo.create({ workspace_id: workspace.id, title });
              sessionId = session.id;
              currentSessionId = sessionId;
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "session-created", sessionId, title }));
              }
            } else {
              currentSessionId = sessionId;
            }

            // Persist user message
            messageRepo.create({
              session_id: sessionId,
              role: "user",
              content: msg.message,
              provider: msg.model,
            });

            const startTime = Date.now();
            let fullResponse = "";

            handle = runProvider({
              provider: msg.model,
              prompt: msg.message,
              cwd,
              onOutput: (chunk) => {
                fullResponse += chunk;
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: "output", data: chunk }));
                }
              },
              onExit: (code) => {
                if (ws.readyState === 1) {
                  if (code !== 0) {
                    ws.send(JSON.stringify({ type: "error", data: `Process exited with code ${code}` }));
                  }

                  // Persist assistant message
                  let messageId: string | undefined;
                  if (sessionId && fullResponse) {
                    const duration_ms = Date.now() - startTime;
                    const assistantMsg = messageRepo.create({
                      session_id: sessionId,
                      role: "assistant",
                      content: fullResponse,
                      provider: msg.model,
                    });
                    messageRepo.updateStatus(assistantMsg.id, "done", { duration_ms });
                    messageId = assistantMsg.id;
                  }

                  ws.send(JSON.stringify({ type: "done", code, sessionId, messageId }));
                }
                handle = null;
              },
            });
            break;
          }

          case "stop":
            if (handle) {
              handle.stop();
              handle = null;
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "stopped" }));
              }
            }
            break;

          case "load-session": {
            if (!msg.sessionId) break;
            const session = sessionRepo.findById(msg.sessionId);
            if (!session) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "error", data: `Session not found: ${msg.sessionId}` }));
              }
              break;
            }
            const messages = messageRepo.findBySession(msg.sessionId);
            currentSessionId = msg.sessionId;
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "session-loaded", session, messages }));
            }
            break;
          }

          case "list-sessions": {
            const db = getDb();
            const sessions = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all();
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "sessions-list", sessions }));
            }
            break;
          }
        }
      } catch (err) {
        console.error("[ws-server] failed to handle message:", err);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "error", data: "Internal server error" }));
        }
      }
    });

    ws.on("close", () => {
      if (handle) {
        handle.stop();
        handle = null;
      }
    });
  });
}
