import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import type { AgentType } from "@nexus/shared";

import "xterm/css/xterm.css";

const MODELS: { type: AgentType; label: string; color: string }[] = [
  { type: "claude", label: "Claude", color: "#ff9500" },
  { type: "codex", label: "Codex", color: "#00c853" },
  { type: "gemini", label: "Gemini", color: "#4285f4" },
];

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function modelColor(model: AgentType): string {
  switch (model) {
    case "claude": return "\x1b[38;2;255;149;0m";
    case "codex": return "\x1b[38;2;0;200;83m";
    case "gemini": return "\x1b[38;2;66;133;244m";
  }
}

export function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [activeModel, setActiveModel] = useState<AgentType>("claude");
  const [waiting, setWaiting] = useState(false);
  const inputBuffer = useRef("");
  const activeModelRef = useRef<AgentType>("claude");
  const waitingRef = useRef(false);

  activeModelRef.current = activeModel;
  waitingRef.current = waiting;

  const showPrompt = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    const c = modelColor(activeModelRef.current);
    term.write(`\r\n${c}${activeModelRef.current}${RESET} ${DIM}›${RESET} `);
    inputBuffer.current = "";
  }, []);

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d8",
        cursor: "#a855f7",
        selectionBackground: "#3f3f46",
      },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 50000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    xtermRef.current = term;

    const resizeObs = new ResizeObserver(() => fit.fit());
    resizeObs.observe(termRef.current);

    // Welcome
    term.write(`${BOLD}Nexus${RESET} ${DIM}— multi-model terminal${RESET}\r\n`);
    term.write(`${DIM}Switch: click model buttons | Ctrl+C: cancel${RESET}\r\n`);

    // WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt = 0;
        showPrompt();
      };

      ws.onmessage = (event) => {
        let msg: { type: string; data?: string; code?: number };
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.error("[ws] failed to parse message:", event.data);
          return;
        }
        switch (msg.type) {
          case "output":
            if (msg.data != null) term.write(msg.data);
            break;
          case "error":
            term.write(`\r\n\x1b[31m${msg.data ?? "Unknown error"}\x1b[0m`);
            break;
          case "done":
            setWaiting(false);
            waitingRef.current = false;
            showPrompt();
            break;
          case "stopped":
            setWaiting(false);
            waitingRef.current = false;
            term.write(`\r\n${DIM}[cancelled]${RESET}`);
            showPrompt();
            break;
        }
      };

      ws.onclose = () => {
        if (destroyed) return;
        wsRef.current = null;
        reconnectAttempt += 1;

        if (reconnectAttempt > 10) {
          term.write(`\r\n${DIM}[server unreachable — click to retry]${RESET}\r\n`);
          return;
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), 15000);
        term.write(`\r\n${DIM}[reconnecting... attempt ${reconnectAttempt}]${RESET}\r\n`);
        reconnectTimer = setTimeout(connect, delay);
      };
    }
    connect();

    // Keyboard
    term.onData((data) => {
      if (waitingRef.current) {
        if (data === "\x03") {
          wsRef.current?.send(JSON.stringify({ type: "stop" }));
        }
        return;
      }

      if (data === "\r") {
        const msg = inputBuffer.current.trim();
        term.write("\r\n");
        if (msg) {
          setWaiting(true);
          waitingRef.current = true;
          wsRef.current?.send(JSON.stringify({
            type: "chat",
            model: activeModelRef.current,
            message: msg,
          }));
        } else {
          showPrompt();
        }
      } else if (data === "\x7f") {
        if (inputBuffer.current.length > 0) {
          inputBuffer.current = inputBuffer.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data === "\x03") {
        term.write("^C");
        showPrompt();
      } else if (data >= " ") {
        inputBuffer.current += data;
        term.write(data);
      }
    });

    return () => {
      destroyed = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      resizeObs.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
    };
  }, [showPrompt]);

  const switchModel = useCallback((model: AgentType) => {
    if (waitingRef.current) return;
    setActiveModel(model);
    activeModelRef.current = model;
    const term = xtermRef.current;
    if (term) {
      const c = modelColor(model);
      term.write(`\r\n${DIM}switched to${RESET} ${c}${BOLD}${model}${RESET}`);
      showPrompt();
    }
  }, [showPrompt]);

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      {/* Top bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <div className="mr-2 flex h-6 w-6 items-center justify-center rounded bg-purple-600 text-xs font-bold text-white">
          N
        </div>
        <span className="mr-4 text-sm font-medium text-zinc-400">Nexus</span>

        {MODELS.map((m) => (
          <button
            key={m.type}
            onClick={() => switchModel(m.type)}
            disabled={waiting}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              activeModel === m.type
                ? "text-white shadow-lg"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            } disabled:opacity-50`}
            style={activeModel === m.type ? { backgroundColor: m.color + "cc" } : undefined}
          >
            {m.label}
          </button>
        ))}

        <div className="ml-auto">
          {waiting && <span className="text-xs text-purple-400 animate-pulse">thinking...</span>}
        </div>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
