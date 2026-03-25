import { Router } from "express";
import { subagentManager } from "../subagents/subagent-manager.js";

export const subagentRoutes = Router();

subagentRoutes.get("/", (_req, res) => {
  res.json(subagentManager.list());
});

subagentRoutes.post("/", (req, res) => {
  try {
    const subagent = subagentManager.create(req.body);
    res.status(201).json(subagent);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

subagentRoutes.delete("/:id", (req, res) => {
  try {
    subagentManager.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
