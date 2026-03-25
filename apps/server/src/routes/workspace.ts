import { Router } from "express";
import { fileExplorer } from "../workspace/file-explorer.js";
import { diffService } from "../workspace/diff-service.js";
import { agentManager } from "../agents/agent-manager.js";

export const workspaceRoutes = Router();

workspaceRoutes.get("/:agentId/files", async (req, res) => {
  const agent = agentManager.getAgent(req.params.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const workDir = agent.worktreePath || agent.projectPath;
  const files = await fileExplorer.listFiles(workDir);
  res.json(files);
});

workspaceRoutes.get("/:agentId/diff", async (req, res) => {
  const agent = agentManager.getAgent(req.params.agentId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const workDir = agent.worktreePath || agent.projectPath;
  const diff = await diffService.getDiff(workDir);
  res.json(diff);
});
