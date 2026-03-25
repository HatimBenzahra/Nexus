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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Array<{id: string; title: string; status: string; created_at: string}>>([]);
  const inputBuffer = useRef("");
  const activeModelRef = useRef<AgentType>("claude");
  const waitingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const spinnerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  activeModelRef.current = activeModel;
  waitingRef.current = waiting;

  const stopSpinner = useCallback(() => {
    if (spinnerRef.current) {
      clearInterval(spinnerRef.current);
      spinnerRef.current = null;
      // Clear the spinner line
      xtermRef.current?.write("\r\x1b[2K");
    }
  }, []);

  const startSpinner = useCallback(() => {
    stopSpinner();
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    const c = modelColor(activeModelRef.current);
    spinnerRef.current = setInterval(() => {
      xtermRef.current?.write(`\r\x1b[2K${DIM}${c}${frames[i % frames.length]}${RESET} ${DIM}thinking...${RESET}`);
      i++;
    }, 80);
  }, [stopSpinner]);

  const showPrompt = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    const c = modelColor(activeModelRef.current);
    term.write(`\r\n${c}${activeModelRef.current}${RESET} ${DIM}›${RESET} `);
    inputBuffer.current = "";
  }, []);

  const fetchSessions = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "list-sessions" }));
    }
  }, []);

  const loadSession = useCallback((id: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      xtermRef.current?.clear();
      xtermRef.current?.write(`${BOLD}Nexus${RESET} ${DIM}— loading session...${RESET}\r\n`);
      sessionIdRef.current = id;
      ws.send(JSON.stringify({ type: "load-session", sessionId: id }));
    }
  }, []);

  const newSession = useCallback(() => {
    sessionIdRef.current = null;
    xtermRef.current?.clear();
    xtermRef.current?.write(`${BOLD}Nexus${RESET} ${DIM}— new session${RESET}\r\n`);
    showPrompt();
  }, [showPrompt]);

  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);

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
        fetchSessions();
      };

      ws.onmessage = (event) => {
        let msg: {
          type: string;
          data?: string;
          code?: number;
          sessionId?: string;
          messageId?: string;
          title?: string;
          session?: unknown;
          messages?: Array<{ role: string; content: string }>;
          sessions?: Array<{id: string; title: string; status: string; created_at: string}>;
        };
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.error("[ws] failed to parse message:", event.data);
          return;
        }
        switch (msg.type) {
          case "output":
            stopSpinner();
            if (msg.data != null) term.write(msg.data);
            break;
          case "error":
            term.write(`\r\n\x1b[31m${msg.data ?? "Unknown error"}\x1b[0m`);
            break;
          case "done":
            stopSpinner();
            if (msg.sessionId) sessionIdRef.current = msg.sessionId;
            setWaiting(false);
            waitingRef.current = false;
            showPrompt();
            break;
          case "stopped":
            stopSpinner();
            setWaiting(false);
            waitingRef.current = false;
            term.write(`\r\n${DIM}[cancelled]${RESET}`);
            showPrompt();
            break;
          case "session-created":
            if (msg.sessionId) sessionIdRef.current = msg.sessionId;
            fetchSessions();
            break;
          case "session-loaded":
            if (msg.messages) {
              for (const m of msg.messages) {
                if (m.role === "user") {
                  term.write(`\r\n${DIM}you: ${m.content}${RESET}\r\n`);
                } else {
                  term.write(`\r\n${m.content}\r\n`);
                }
              }
              showPrompt();
            }
            break;
          case "sessions-list":
            if (msg.sessions && Array.isArray(msg.sessions)) {
              setSessions(msg.sessions);
            }
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
          stopSpinner();
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
          startSpinner();
          wsRef.current?.send(JSON.stringify({
            type: "chat",
            model: activeModelRef.current,
            message: msg,
            ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
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
      stopSpinner();
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      resizeObs.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
    };
  }, [showPrompt, fetchSessions]);

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
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 3h12M1 7h12M1 11h12" />
          </svg>
        </button>
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

        <div className="ml-auto" />
      </div>

      {/* Terminal + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Sessions</span>
              <button onClick={newSession} className="rounded px-2 py-0.5 text-xs text-purple-400 hover:bg-zinc-800">+ New</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 && <div className="px-3 py-4 text-xs text-zinc-600">No sessions yet</div>}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`w-full px-3 py-2 text-left transition-colors ${
                    sessionIdRef.current === s.id
                      ? "bg-zinc-800 border-l-2 border-purple-500"
                      : "hover:bg-zinc-800/50 border-l-2 border-transparent"
                  }`}
                >
                  <div className="truncate text-sm text-zinc-300">{s.title || "Untitled"}</div>
                  <div className="mt-0.5 text-xs text-zinc-600">{new Date(s.created_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={termRef} className="flex-1 overflow-hidden" />
      </div>
    </div>
  );
}
