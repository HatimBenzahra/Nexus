import { Router } from "express";
import { runChat } from "../chat/chat-service.js";

export const chatRoutes = Router();

chatRoutes.post("/respond", async (req, res) => {
  try {
    const response = await runChat(req.body);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
