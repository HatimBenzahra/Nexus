import { Router } from "express";
import { sessionRepo, messageRepo } from "../db/repositories/index.js";
import { getDb } from "../db/connection.js";

export const sessionRoutes = Router();

// GET /api/sessions — list all sessions
sessionRoutes.get("/", (_req, res) => {
  try {
    const db = getDb();
    const sessions = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all();
    res.json({ sessions });
  } catch (err) {
    console.error("[sessions] list error:", err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

// GET /api/sessions/:id — get session detail + messages
sessionRoutes.get("/:id", (req, res) => {
  try {
    const session = sessionRepo.findById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const messages = messageRepo.findBySession(req.params.id);
    res.json({ session, messages });
  } catch (err) {
    console.error("[sessions] get error:", err);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// POST /api/sessions — create new session
sessionRoutes.post("/", (req, res) => {
  try {
    const { workspace_id, title, primary_agent_id } = req.body as {
      workspace_id: string;
      title?: string;
      primary_agent_id?: string;
    };
    if (!workspace_id) {
      res.status(400).json({ error: "workspace_id is required" });
      return;
    }
    const session = sessionRepo.create({ workspace_id, title, primary_agent_id });
    res.status(201).json({ session });
  } catch (err) {
    console.error("[sessions] create error:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// DELETE /api/sessions/:id — delete session
sessionRoutes.delete("/:id", (req, res) => {
  try {
    const session = sessionRepo.findById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    sessionRepo.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[sessions] delete error:", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});
