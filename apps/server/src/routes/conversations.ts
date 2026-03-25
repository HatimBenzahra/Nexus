import { Router } from "express";
import { conversationManager } from "../conversations/conversation-manager.js";

export const conversationRoutes = Router();

conversationRoutes.get("/", (_req, res) => {
  res.json(conversationManager.listSessions());
});

conversationRoutes.post("/", (req, res) => {
  try {
    const conversation = conversationManager.createSession(req.body);
    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

conversationRoutes.get("/:id", (req, res) => {
  const conversation = conversationManager.getSession(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(conversation);
});

conversationRoutes.post("/:id/messages", async (req, res) => {
  try {
    const conversation = await conversationManager.addMessage(req.params.id, req.body);
    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
