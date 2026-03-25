import { Router } from "express";
import { mcpManager } from "../mcp/mcp-manager.js";

export const mcpRoutes = Router();

mcpRoutes.get("/", async (_req, res) => {
  const servers = await mcpManager.listServers();
  res.json(servers);
});

mcpRoutes.post("/", async (req, res) => {
  try {
    await mcpManager.addServer(req.body);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

mcpRoutes.delete("/:name", async (req, res) => {
  try {
    await mcpManager.removeServer(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

mcpRoutes.post("/:name/health", async (req, res) => {
  const result = await mcpManager.healthCheck(req.params.name);
  res.json(result);
});
