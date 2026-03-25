import { Router } from "express";
import { agentManager } from "../agents/agent-manager.js";
import { getAvailableAgents } from "../agents/agent-registry.js";

export const agentRoutes = Router();

// Returns which CLIs are installed
agentRoutes.get("/available", (_req, res) => {
  res.json(getAvailableAgents());
});

agentRoutes.get("/", (_req, res) => {
  res.json(agentManager.listAgents());
});

agentRoutes.post("/", (req, res) => {
  try {
    const agent = agentManager.createAgent(req.body);
    res.status(201).json(agent);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

agentRoutes.delete("/:id", (req, res) => {
  try {
    agentManager.stopAgent(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
