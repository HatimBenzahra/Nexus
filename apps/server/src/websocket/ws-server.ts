import type { WebSocketServer } from "ws";
import { runProvider, type ProviderRunHandle } from "../providers/provider-runner.js";
import { homedir } from "os";
import { basename } from "path";
import type { AgentType } from "@nexus/shared";
import { workspaceRepo, sessionRepo, messageRepo, agentRepo } from "../db/repositories/index.js";
import { getDb } from "../db/connection.js";
import { buildContext, extractAndSaveMemories, decayMemories } from "../orchestrator/index.js";

interface WsMsg {
  type: "chat" | "stop" | "load-session" | "list-sessions" | "create-agent" | "list-agents";
  model?: AgentType;
  message?: string;
  cwd?: string;
  sessionId?: string;
  agentName?: string;
  agentRole?: string;
  agentProvider?: string;
  agentSystemPrompt?: string;
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
              const existingAgents = agentRepo.findByWorkspace(workspace.id);
              const defaultAgent = existingAgents.find(a => a.provider === msg.model && a.status !== 'archived');
              if (!defaultAgent) {
                agentRepo.create({ workspace_id: workspace.id, name: `Default ${msg.model}`, role: 'assistant', provider: msg.model!, system_prompt: `You are a helpful ${msg.model} assistant.` });
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

            // Resolve matching agent and build enriched context prompt
            let finalPrompt = msg.message;
            const workspace = getOrCreateWorkspace(cwd);
            const agents = agentRepo.findByWorkspace(workspace.id);
            const matchingAgent = agents.find(a => a.provider === msg.model && a.status !== 'archived');
            if (matchingAgent) {
              const ctx = buildContext({
                agent_id: matchingAgent.id,
                session_id: sessionId,
                current_message: msg.message,
              });
              finalPrompt = ctx.prompt;
            }

            const startTime = Date.now();
            let fullResponse = "";

            handle = runProvider({
              provider: msg.model,
              prompt: finalPrompt,
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

                  if (matchingAgent && fullResponse) {
                    try {
                      extractAndSaveMemories(matchingAgent.id, fullResponse, msg.message!);
                      decayMemories(matchingAgent.id);
                    } catch (err) {
                      console.error("[ws-server] memory extraction failed:", err);
                    }
                  }
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

          case "create-agent": {
            if (!msg.agentName || !msg.agentProvider) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "error", data: "agentName and agentProvider are required" }));
              }
              break;
            }
            if (msg.cwd) cwd = msg.cwd;
            const workspace = getOrCreateWorkspace(cwd);
            const agent = agentRepo.create({
              workspace_id: workspace.id,
              name: msg.agentName,
              role: msg.agentRole ?? "assistant",
              provider: msg.agentProvider,
              system_prompt: msg.agentSystemPrompt,
            });
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "agent-created", agent }));
            }
            break;
          }

          case "list-agents": {
            if (msg.cwd) cwd = msg.cwd;
            const workspace = getOrCreateWorkspace(cwd);
            const agents = agentRepo.findByWorkspace(workspace.id).filter(a => a.status !== "archived");
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "agents-list", agents }));
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
