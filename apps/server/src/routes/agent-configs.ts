import { Router } from "express";
import { agentRepo, memoryRepo, workspaceRepo } from "../db/repositories/index.js";

export const agentConfigRoutes = Router();

const VALID_PROVIDERS = ["claude", "codex", "gemini"];
const VALID_MEMORY_TYPES = ["fact", "episode", "directive"];

// GET / — list agents for workspace
agentConfigRoutes.get("/", (req, res) => {
  try {
    const { workspace_id, include_archived } = req.query;
    if (!workspace_id || typeof workspace_id !== "string") {
      res.status(400).json({ error: "workspace_id query param is required" });
      return;
    }
    let agents = agentRepo.findByWorkspace(workspace_id);
    if (include_archived !== "true") {
      agents = agents.filter((a) => a.status !== "archived");
    }
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST / — create agent
agentConfigRoutes.post("/", (req, res) => {
  try {
    const { workspace_id, name, role, provider, system_prompt, color } = req.body;
    if (!workspace_id || !name || !role || !provider) {
      res.status(400).json({ error: "workspace_id, name, role, provider are required" });
      return;
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }
    const workspace = workspaceRepo.findById(workspace_id);
    if (!workspace) {
      res.status(404).json({ error: `Workspace not found: ${workspace_id}` });
      return;
    }
    const agent = agentRepo.create({ workspace_id, name, role, provider, system_prompt, color });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /:id — get agent + memories
agentConfigRoutes.get("/:id", (req, res) => {
  try {
    const agent = agentRepo.findById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${req.params.id}` });
      return;
    }
    const memories = memoryRepo.findByAgent(agent.id);
    res.json({ ...agent, memories });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /:id — update agent fields
agentConfigRoutes.put("/:id", (req, res) => {
  try {
    const agent = agentRepo.findById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${req.params.id}` });
      return;
    }
    if (req.body.provider !== undefined && !VALID_PROVIDERS.includes(req.body.provider)) {
      res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }
    const updated = agentRepo.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /:id — soft-delete (set status to 'archived')
agentConfigRoutes.delete("/:id", (req, res) => {
  try {
    const agent = agentRepo.findById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${req.params.id}` });
      return;
    }
    agentRepo.updateStatus(req.params.id, "archived");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /:id/memories — add memory
agentConfigRoutes.post("/:id/memories", (req, res) => {
  try {
    const agent = agentRepo.findById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${req.params.id}` });
      return;
    }
    const { type, content, source } = req.body;
    if (!type || !content) {
      res.status(400).json({ error: "type and content are required" });
      return;
    }
    if (!VALID_MEMORY_TYPES.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_MEMORY_TYPES.join(", ")}` });
      return;
    }
    const memory = memoryRepo.create({ agent_id: agent.id, type, content, source });
    res.status(201).json(memory);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /:id/memories — list memories
agentConfigRoutes.get("/:id/memories", (req, res) => {
  try {
    const agent = agentRepo.findById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${req.params.id}` });
      return;
    }
    const { type, limit } = req.query;
    const memories = memoryRepo.findByAgent(
      agent.id,
      typeof type === "string" ? type : undefined,
      typeof limit === "string" ? parseInt(limit, 10) : undefined
    );
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
