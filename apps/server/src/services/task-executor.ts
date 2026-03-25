import { runProvider, type ProviderRunHandle } from "../providers/provider-runner.js";
import { taskRepo, agentRepo, sessionRepo, messageRepo, workspaceRepo } from "../db/repositories/index.js";
import { buildContext } from "../orchestrator/index.js";
import { homedir } from "os";
import type { AgentType } from "@nexus/shared";

export interface TaskExecution {
  taskId: string;
  handle: ProviderRunHandle;
  sessionId: string;
}

const activeExecutions = new Map<string, TaskExecution>();

export function executeTask(
  taskId: string,
  options?: {
    cwd?: string;
    onOutput?: (chunk: string) => void;
    onComplete?: (result: string, success: boolean) => void;
  }
): TaskExecution {
  const task = taskRepo.findById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  if (task.status !== "pending" && task.status !== "failed") {
    throw new Error(`Task is not in a runnable state: ${task.status}`);
  }

  if (!task.assigned_to) {
    throw new Error(`Task has no assigned agent`);
  }
  const agent = agentRepo.findById(task.assigned_to);
  if (!agent) {
    throw new Error(`Assigned agent not found: ${task.assigned_to}`);
  }

  let cwd = options?.cwd;
  if (!cwd && task.workspace_id) {
    cwd = workspaceRepo.findById(task.workspace_id)?.path;
  }
  if (!cwd) {
    cwd = homedir();
  }

  const session = sessionRepo.create({
    workspace_id: task.workspace_id,
    title: `Task: ${task.title}`,
  });
  const sessionId = session.id;

  taskRepo.updateStatus(taskId, "in_progress");

  let basePrompt = `You have been assigned a task:\n\nTitle: ${task.title}\nDescription: ${task.description}\nPriority: ${task.priority}\n\nComplete this task and provide a summary.`;

  let prompt = basePrompt;
  try {
    const ctx = buildContext({
      agent_id: agent.id,
      session_id: sessionId,
      current_message: basePrompt,
    });
    prompt = ctx.prompt;
  } catch {
    // fallback to base prompt if context build fails
  }

  let fullResponse = "";

  const handle = runProvider({
    provider: agent.provider as AgentType,
    prompt,
    cwd,
    onOutput: (chunk) => {
      fullResponse += chunk;
      options?.onOutput?.(chunk);
    },
    onExit: (code) => {
      const success = code === 0;
      const status = success ? "completed" : "failed";

      try {
        if (fullResponse) {
          const assistantMsg = messageRepo.create({
            session_id: sessionId,
            role: "assistant",
            content: fullResponse,
            agent_id: agent.id,
            provider: agent.provider,
          });
          messageRepo.updateStatus(assistantMsg.id, "done");
        }
        taskRepo.updateStatus(taskId, status, fullResponse || undefined);
      } catch (err) {
        console.error("[task-executor] failed to persist result:", err);
      }

      options?.onComplete?.(fullResponse, success);
      activeExecutions.delete(taskId);
    },
  });

  const execution: TaskExecution = { taskId, handle, sessionId };
  activeExecutions.set(taskId, execution);
  return execution;
}

export function cancelTask(taskId: string): boolean {
  const execution = activeExecutions.get(taskId);
  if (!execution) {
    return false;
  }
  execution.handle.stop();
  activeExecutions.delete(taskId);
  try {
    taskRepo.updateStatus(taskId, "failed", "Cancelled by user");
  } catch (err) {
    console.error("[task-executor] failed to update status on cancel:", err);
  }
  return true;
}

export function getActiveExecutions(): Map<string, TaskExecution> {
  return activeExecutions;
}
