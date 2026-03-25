import type { WebSocketServer } from "ws";
import { runProvider, type ProviderRunHandle } from "../providers/provider-runner.js";
import { homedir } from "os";
import { basename } from "path";
import type { AgentType, ProviderSettings } from "@nexus/shared";
import { workspaceRepo, sessionRepo, messageRepo, agentRepo, taskRepo } from "../db/repositories/index.js";
import { getDb } from "../db/connection.js";
import { buildContext, extractAndSaveMemories, decayMemories } from "../orchestrator/index.js";
import { parseSlashCommand } from "../services/slash-commands.js";
import { executeTask, cancelTask } from "../services/task-executor.js";

interface WsMsg {
  type: "chat" | "stop" | "load-session" | "list-sessions" | "create-agent" | "list-agents" | "slash-command" | "execute-task" | "cancel-task" | "get-model-settings" | "update-model-settings";
  model?: AgentType;
  message?: string;
  cwd?: string;
  sessionId?: string;
  agentName?: string;
  agentRole?: string;
  agentProvider?: string;
  agentSystemPrompt?: string;
  slashInput?: string;
  taskId?: string;
  settings?: unknown;
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
            let settings: ProviderSettings | undefined;
            if (matchingAgent?.config_json) {
              try { settings = JSON.parse(matchingAgent.config_json); } catch {}
            }
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
              settings,
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

          case "slash-command": {
            const parsed = parseSlashCommand(msg.slashInput ?? "");
            if (!parsed) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "task-error", data: `Unknown command: ${msg.slashInput}` }));
              }
              break;
            }
            if (msg.cwd) cwd = msg.cwd;
            const slashWorkspace = getOrCreateWorkspace(cwd);

            switch (parsed.command) {
              case "tasks": {
                const filters: { status?: string; assigned_to?: string } = {};
                if (parsed.args["status"]) filters.status = parsed.args["status"];
                if (parsed.args["assign"]) filters.assigned_to = parsed.args["assign"];
                const tasks = taskRepo.findByWorkspace(slashWorkspace.id, filters);
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: "task-list", tasks }));
                }
                break;
              }
              case "task": {
                if (parsed.action === "create") {
                  const title = parsed.positional;
                  if (!title) {
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({ type: "task-error", data: "Task title is required" }));
                    }
                    break;
                  }
                  // Find or create system agent for created_by
                  const existingAgents = agentRepo.findByWorkspace(slashWorkspace.id);
                  let systemAgent = existingAgents.find(a => a.name === "system" && a.role === "system");
                  if (!systemAgent) {
                    systemAgent = agentRepo.create({
                      workspace_id: slashWorkspace.id,
                      name: "system",
                      role: "system",
                      provider: "system",
                    });
                  }
                  const priority = parsed.args["priority"] ? parseInt(parsed.args["priority"], 10) : undefined;
                  const task = taskRepo.create({
                    workspace_id: slashWorkspace.id,
                    title,
                    created_by: systemAgent.id,
                    assigned_to: parsed.args["assign"],
                    priority,
                  });
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "task-created", task }));
                  }
                } else if (parsed.action === "status") {
                  const taskId = parsed.positional;
                  if (!taskId) {
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({ type: "task-error", data: "Task id is required" }));
                    }
                    break;
                  }
                  const task = taskRepo.findById(taskId);
                  if (!task) {
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({ type: "task-error", data: `Task not found: ${taskId}` }));
                    }
                    break;
                  }
                  const subtasks = taskRepo.findChildren(task.id);
                  const dependencies = taskRepo.getDependencies(task.id);
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "task-detail", task, subtasks, dependencies }));
                  }
                } else {
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "task-error", data: `Unknown task action: ${parsed.action}` }));
                  }
                }
                break;
              }
              default: {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: "task-error", data: `Unknown command: /${parsed.command}` }));
                }
              }
            }
            break;
          }

          case "execute-task": {
            if (!msg.taskId) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "error", data: "taskId is required" }));
              }
              break;
            }
            try {
              const execution = executeTask(msg.taskId, {
                cwd,
                onOutput: (chunk) => {
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "task-output", taskId: msg.taskId, data: chunk }));
                  }
                },
                onComplete: (result, success) => {
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "task-execution-done", taskId: msg.taskId, success, result: result.slice(0, 500) }));
                  }
                },
              });
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "task-execution-started", taskId: msg.taskId, sessionId: execution.sessionId }));
              }
            } catch (err) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "error", data: (err as Error).message }));
              }
            }
            break;
          }

          case "cancel-task": {
            if (!msg.taskId) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "error", data: "taskId is required" }));
              }
              break;
            }
            const cancelled = cancelTask(msg.taskId);
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(cancelled
                ? { type: "task-execution-cancelled", taskId: msg.taskId }
                : { type: "error", taskId: msg.taskId }
              ));
            }
            break;
          }

          case "get-model-settings": {
            if (!msg.model) break;
            if (msg.cwd) cwd = msg.cwd;
            const settingsWorkspace = getOrCreateWorkspace(cwd);
            const settingsAgents = agentRepo.findByWorkspace(settingsWorkspace.id);
            const settingsAgent = settingsAgents.find(a => a.provider === msg.model && a.status !== 'archived');
            let modelSettings: ProviderSettings | undefined;
            if (settingsAgent?.config_json) {
              try { modelSettings = JSON.parse(settingsAgent.config_json); } catch {}
            }
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "model-settings", model: msg.model, settings: modelSettings }));
            }
            break;
          }

          case "update-model-settings": {
            if (!msg.model) break;
            if (msg.cwd) cwd = msg.cwd;
            const updateWorkspace = getOrCreateWorkspace(cwd);
            const updateAgents = agentRepo.findByWorkspace(updateWorkspace.id);
            const updateAgent = updateAgents.find(a => a.provider === msg.model && a.status !== 'archived');
            if (updateAgent) {
              const config_json = JSON.stringify(msg.settings ?? {});
              agentRepo.update(updateAgent.id, { config_json });
            }
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "model-settings-updated" }));
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
