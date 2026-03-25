import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { DEFAULT_PORTS } from "@nexus/shared";
import { agentRoutes } from "./routes/agents.js";
import { mcpRoutes } from "./routes/mcp.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { directoryRoutes } from "./routes/directories.js";
import { conversationRoutes } from "./routes/conversations.js";
import { subagentRoutes } from "./routes/subagents.js";
import { chatRoutes } from "./routes/chat.js";
import { setupWebSocket } from "./websocket/ws-server.js";

const app = express();
const server = createServer(app);

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001'] }));
app.use(express.json());

// REST routes
app.use("/api/agents", agentRoutes);
app.use("/api/mcp", mcpRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/directories", directoryRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/subagents", subagentRoutes);
app.use("/api/chat", chatRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket
const wss = new WebSocketServer({ server, path: "/ws" });
setupWebSocket(wss);

const port = DEFAULT_PORTS.server;
server.listen(port, () => {
  console.log(`[nexus] Server running on http://localhost:${port}`);
  console.log(`[nexus] WebSocket on ws://localhost:${port}/ws`);
});
