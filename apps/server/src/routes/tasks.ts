import { Router } from "express";
import { taskRepo, agentRepo, workspaceRepo } from "../db/repositories/index.js";

export const taskRoutes = Router();

function getOrCreateSystemAgent(workspaceId: string): string {
  const agents = agentRepo.findByWorkspace(workspaceId);
  const existing = agents.find(a => a.name === "system" && a.role === "system");
  if (existing) return existing.id;
  const agent = agentRepo.create({
    workspace_id: workspaceId,
    name: "system",
    role: "system",
    provider: "system",
  });
  return agent.id;
}

// GET / — list tasks
taskRoutes.get("/", (req, res) => {
  try {
    const { workspace_id, status, assigned_to } = req.query as Record<string, string | undefined>;
    if (!workspace_id) {
      res.status(400).json({ error: "workspace_id is required" });
      return;
    }
    const tasks = taskRepo.findByWorkspace(workspace_id, { status, assigned_to });
    res.json(tasks);
  } catch (err) {
    console.error("[tasks] GET /", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create task
taskRoutes.post("/", (req, res) => {
  try {
    const { workspace_id, title, description, assigned_to, parent_task_id, priority } = req.body as {
      workspace_id?: string;
      title?: string;
      description?: string;
      assigned_to?: string;
      parent_task_id?: string;
      priority?: number;
    };
    if (!workspace_id || !title) {
      res.status(400).json({ error: "workspace_id and title are required" });
      return;
    }
    const workspace = workspaceRepo.findById(workspace_id);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    const created_by = getOrCreateSystemAgent(workspace_id);
    const task = taskRepo.create({ workspace_id, title, description, created_by, assigned_to, parent_task_id, priority });
    res.status(201).json(task);
  } catch (err) {
    console.error("[tasks] POST /", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:id — get task + subtasks + dependencies
taskRoutes.get("/:id", (req, res) => {
  try {
    const task = taskRepo.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const subtasks = taskRepo.findChildren(task.id);
    const dependencies = taskRepo.getDependencies(task.id);
    res.json({ task, subtasks, dependencies });
  } catch (err) {
    console.error("[tasks] GET /:id", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id — update task
taskRoutes.put("/:id", (req, res) => {
  try {
    const task = taskRepo.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const updated = taskRepo.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("[tasks] PUT /:id", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id — delete task
taskRoutes.delete("/:id", (req, res) => {
  try {
    const task = taskRepo.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    taskRepo.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error("[tasks] DELETE /:id", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /:id/dependencies — add dependency
taskRoutes.post("/:id/dependencies", (req, res) => {
  try {
    const { depends_on_id } = req.body as { depends_on_id?: string };
    if (!depends_on_id) {
      res.status(400).json({ error: "depends_on_id is required" });
      return;
    }
    const task = taskRepo.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    taskRepo.addDependency(req.params.id, depends_on_id);
    res.status(201).json({ task_id: req.params.id, depends_on_id });
  } catch (err) {
    console.error("[tasks] POST /:id/dependencies", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id/dependencies/:depId — remove dependency
taskRoutes.delete("/:id/dependencies/:depId", (req, res) => {
  try {
    const task = taskRepo.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    taskRepo.removeDependency(req.params.id, req.params.depId);
    res.status(204).send();
  } catch (err) {
    console.error("[tasks] DELETE /:id/dependencies/:depId", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
