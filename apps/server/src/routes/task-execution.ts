import { Router } from "express";
import { executeTask, cancelTask, getActiveExecutions } from "../services/task-executor.js";

export const taskExecutionRoutes = Router();

// POST /api/task-execution/:id/execute
taskExecutionRoutes.post("/:id/execute", (req, res) => {
  try {
    const { cwd } = req.body as { cwd?: string };
    const execution = executeTask(req.params.id, { cwd });
    res.json({ taskId: execution.taskId, sessionId: execution.sessionId, status: "started" });
  } catch (err) {
    console.error("[task-execution] execute error:", err);
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/task-execution/:id/cancel
taskExecutionRoutes.post("/:id/cancel", (req, res) => {
  try {
    const cancelled = cancelTask(req.params.id);
    res.json({ taskId: req.params.id, status: cancelled ? "cancelled" : "not_found" });
  } catch (err) {
    console.error("[task-execution] cancel error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/task-execution/active
taskExecutionRoutes.get("/active", (_req, res) => {
  try {
    const executions = getActiveExecutions();
    const active = Array.from(executions.entries()).map(([taskId, exec]) => ({
      taskId,
      sessionId: exec.sessionId,
    }));
    res.json({ active });
  } catch (err) {
    console.error("[task-execution] active error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
