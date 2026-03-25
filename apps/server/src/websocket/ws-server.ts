import type { WebSocketServer } from "ws";
import { runProvider, type ProviderRunHandle } from "../providers/provider-runner.js";
import { homedir } from "os";
import type { AgentType } from "@nexus/shared";

interface WsMsg {
  type: "chat" | "stop";
  model?: AgentType;
  message?: string;
  cwd?: string;
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    let handle: ProviderRunHandle | null = null;
    let cwd = homedir();

    ws.on("message", (raw) => {
      try {
        const msg: WsMsg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "chat":
            if (!msg.model || !msg.message) break;
            if (msg.cwd) cwd = msg.cwd;

            // Stop any running process
            if (handle) {
              handle.stop();
              handle = null;
            }

            handle = runProvider({
              provider: msg.model,
              prompt: msg.message,
              cwd,
              onOutput: (chunk) => {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: "output", data: chunk }));
                }
              },
              onExit: (code) => {
                if (ws.readyState === 1) {
                  if (code !== 0) {
                    ws.send(JSON.stringify({ type: "error", data: `Process exited with code ${code}` }));
                  }
                  ws.send(JSON.stringify({ type: "done", code }));
                }
                handle = null;
              },
            });
            break;

          case "stop":
            if (handle) {
              handle.stop();
              handle = null;
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "stopped" }));
              }
            }
            break;
        }
      } catch (err) {
        console.error("[ws-server] failed to handle message:", err);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "error", data: "Internal server error" }));
        }
      }
    });

    ws.on("close", () => {
      if (handle) {
        handle.stop();
        handle = null;
      }
    });
  });
}
