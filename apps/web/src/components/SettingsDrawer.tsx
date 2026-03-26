import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentType, ClaudeSettings, CodexSettings, GeminiSettings, ProviderSettings } from "@nexus/shared";

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SettingsSelectProps {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}
function SettingsSelect({ label, value, options, onChange }: SettingsSelectProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 border border-zinc-700 focus:outline-none focus:border-zinc-500 min-w-[110px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface SettingsInputProps {
  label: string;
  value: string | number | undefined;
  type?: "text" | "number";
  placeholder?: string;
  prefix?: string;
  onChange: (v: string) => void;
}
function SettingsInput({ label, value, type = "text", placeholder, prefix, onChange }: SettingsInputProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center rounded bg-zinc-800 border border-zinc-700 focus-within:border-zinc-500 min-w-[110px] overflow-hidden">
        {prefix && <span className="pl-2 text-xs text-zinc-500">{prefix}</span>}
        <input
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent px-2 py-1 text-xs text-zinc-200 focus:outline-none w-full"
        />
      </div>
    </div>
  );
}

interface SettingsToggleProps {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}
function SettingsToggle({ label, value, onChange }: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
          value ? "bg-zinc-300" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-zinc-900 transition-transform ${
            value ? "translate-x-4" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

interface SettingsSliderProps {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}
function SettingsSlider({ label, value, min = 0, max = 1, step = 0.05, onChange }: SettingsSliderProps) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500">{value?.toFixed(2) ?? "—"}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? (min + max) / 2}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-zinc-300 bg-zinc-700 rounded h-1 appearance-none"
      />
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
function SettingsSection({ title, defaultOpen = true, children }: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      {open && <div className="px-4 pb-2">{children}</div>}
    </div>
  );
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  activeModel: AgentType;
  wsRef: React.RefObject<WebSocket | null>;
}

const MODEL_COLORS: Record<AgentType, string> = {
  claude: "#ff9500",
  codex: "#00c853",
  gemini: "#4285f4",
};

const MODEL_LABELS: Record<AgentType, string> = {
  claude: "Claude Settings",
  codex: "Codex Settings",
  gemini: "Gemini Settings",
};

export function SettingsDrawer({ open, onClose, activeModel, wsRef }: SettingsDrawerProps) {
  const [settings, setSettings] = useState<ProviderSettings>({});
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request settings when drawer opens or model changes
  useEffect(() => {
    if (!open) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setLoading(true);
    ws.send(JSON.stringify({ type: "get-model-settings", model: activeModel }));
  }, [open, activeModel, wsRef]);

  // Listen for model-settings response
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    function handleMessage(event: MessageEvent) {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "model-settings") {
          setSettings(msg.settings ?? {});
          setLoading(false);
        }
      } catch {
        // ignore
      }
    }

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [wsRef, open]);

  const sendUpdate = useCallback(
    (merged: ProviderSettings) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "update-model-settings", model: activeModel, settings: merged }));
    },
    [wsRef, activeModel]
  );

  const handleChange = useCallback(
    (patch: Partial<ProviderSettings>, debounce = false) => {
      const merged = { ...settings, ...patch } as ProviderSettings;
      setSettings(merged);
      if (debounce) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => sendUpdate(merged), 300);
      } else {
        sendUpdate(merged);
      }
    },
    [settings, sendUpdate]
  );

  const accentColor = MODEL_COLORS[activeModel];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-zinc-900 border-l border-zinc-800 shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-zinc-800"
          style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
        >
          <span className="text-sm font-semibold text-zinc-200" style={{ color: accentColor }}>
            {MODEL_LABELS[activeModel]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-zinc-600">Loading...</span>
            </div>
          ) : (
            <>
              {/* Model section */}
              <SettingsSection title="Model">
                <SettingsInput
                  label="Model"
                  value={(settings as ClaudeSettings | CodexSettings | GeminiSettings).model}
                  placeholder={
                    activeModel === "claude"
                      ? "sonnet"
                      : activeModel === "codex"
                      ? "codex-mini"
                      : "gemini-2.0-flash"
                  }
                  onChange={(v) => handleChange({ model: v || undefined } as Partial<ProviderSettings>, true)}
                />

                {/* Claude: effort */}
                {activeModel === "claude" && (
                  <SettingsSelect
                    label="Effort"
                    value={(settings as ClaudeSettings).effort}
                    options={[
                      { value: "", label: "default" },
                      { value: "low", label: "low" },
                      { value: "medium", label: "medium" },
                      { value: "high", label: "high" },
                      { value: "max", label: "max" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        effort: (v || undefined) as ClaudeSettings["effort"],
                      } as Partial<ClaudeSettings>)
                    }
                  />
                )}

                {/* Gemini: temperature */}
                {activeModel === "gemini" && (
                  <SettingsSlider
                    label="Temperature"
                    value={(settings as GeminiSettings).temperature}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={(v) => handleChange({ temperature: v } as Partial<GeminiSettings>, true)}
                  />
                )}

                {/* Codex: reasoning effort */}
                {activeModel === "codex" && (
                  <SettingsSelect
                    label="Reasoning"
                    value={(settings as CodexSettings).reasoningEffort}
                    options={[
                      { value: "", label: "default" },
                      { value: "none", label: "none" },
                      { value: "low", label: "low" },
                      { value: "medium", label: "medium" },
                      { value: "high", label: "high" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        reasoningEffort: (v || undefined) as CodexSettings["reasoningEffort"],
                      } as Partial<CodexSettings>)
                    }
                  />
                )}
              </SettingsSection>

              {/* Behavior section */}
              <SettingsSection title="Behavior">
                {/* Claude: max turns */}
                {activeModel === "claude" && (
                  <SettingsInput
                    label="Max turns"
                    value={(settings as ClaudeSettings).maxTurns}
                    type="number"
                    placeholder="10"
                    onChange={(v) =>
                      handleChange(
                        { maxTurns: v ? parseInt(v, 10) : undefined } as Partial<ClaudeSettings>,
                        true
                      )
                    }
                  />
                )}

                {/* Claude: max budget */}
                {activeModel === "claude" && (
                  <SettingsInput
                    label="Max budget"
                    value={(settings as ClaudeSettings).maxBudgetUsd}
                    type="number"
                    placeholder="5"
                    prefix="$"
                    onChange={(v) =>
                      handleChange(
                        { maxBudgetUsd: v ? parseFloat(v) : undefined } as Partial<ClaudeSettings>,
                        true
                      )
                    }
                  />
                )}

                {/* Codex: full auto */}
                {activeModel === "codex" && (
                  <SettingsToggle
                    label="Full auto"
                    value={(settings as CodexSettings).fullAuto}
                    onChange={(v) => handleChange({ fullAuto: v } as Partial<CodexSettings>)}
                  />
                )}

                {/* Codex: quiet */}
                {activeModel === "codex" && (
                  <SettingsToggle
                    label="Quiet"
                    value={(settings as CodexSettings).quiet}
                    onChange={(v) => handleChange({ quiet: v } as Partial<CodexSettings>)}
                  />
                )}

                {/* Gemini: yolo */}
                {activeModel === "gemini" && (
                  <SettingsToggle
                    label="YOLO mode"
                    value={(settings as GeminiSettings).yolo}
                    onChange={(v) => handleChange({ yolo: v } as Partial<GeminiSettings>)}
                  />
                )}
              </SettingsSection>

              {/* Safety section */}
              <SettingsSection title="Safety">
                {/* Claude & Gemini: permission/approval mode */}
                {activeModel === "claude" && (
                  <SettingsSelect
                    label="Permissions"
                    value={(settings as ClaudeSettings).permissionMode}
                    options={[
                      { value: "", label: "default" },
                      { value: "default", label: "default" },
                      { value: "plan", label: "plan" },
                      { value: "auto", label: "auto" },
                      { value: "bypassPermissions", label: "bypass" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        permissionMode: (v || undefined) as ClaudeSettings["permissionMode"],
                      } as Partial<ClaudeSettings>)
                    }
                  />
                )}

                {activeModel === "gemini" && (
                  <SettingsSelect
                    label="Approval"
                    value={(settings as GeminiSettings).approvalMode}
                    options={[
                      { value: "", label: "default" },
                      { value: "default", label: "default" },
                      { value: "auto_edit", label: "auto edit" },
                      { value: "yolo", label: "yolo" },
                      { value: "plan", label: "plan" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        approvalMode: (v || undefined) as GeminiSettings["approvalMode"],
                      } as Partial<GeminiSettings>)
                    }
                  />
                )}

                {activeModel === "codex" && (
                  <SettingsSelect
                    label="Approval"
                    value={(settings as CodexSettings).approvalMode}
                    options={[
                      { value: "", label: "default" },
                      { value: "untrusted", label: "untrusted" },
                      { value: "on-request", label: "on-request" },
                      { value: "never", label: "never" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        approvalMode: (v || undefined) as CodexSettings["approvalMode"],
                      } as Partial<CodexSettings>)
                    }
                  />
                )}

                {/* Codex: sandbox */}
                {activeModel === "codex" && (
                  <SettingsSelect
                    label="Sandbox"
                    value={(settings as CodexSettings).sandbox}
                    options={[
                      { value: "", label: "default" },
                      { value: "read-only", label: "read-only" },
                      { value: "workspace-write", label: "workspace-write" },
                      { value: "danger-full-access", label: "full-access" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        sandbox: (v || undefined) as CodexSettings["sandbox"],
                      } as Partial<CodexSettings>)
                    }
                  />
                )}

                {/* Gemini: sandboxed */}
                {activeModel === "gemini" && (
                  <SettingsToggle
                    label="Sandboxed"
                    value={(settings as GeminiSettings).sandboxed}
                    onChange={(v) => handleChange({ sandboxed: v } as Partial<GeminiSettings>)}
                  />
                )}
              </SettingsSection>

              {/* Advanced section — collapsed by default */}
              <SettingsSection title="Advanced" defaultOpen={false}>
                {/* Claude & Gemini: output format */}
                {activeModel === "claude" && (
                  <SettingsSelect
                    label="Output"
                    value={(settings as ClaudeSettings).outputFormat}
                    options={[
                      { value: "", label: "default" },
                      { value: "text", label: "text" },
                      { value: "json", label: "json" },
                      { value: "stream-json", label: "stream-json" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        outputFormat: (v || undefined) as ClaudeSettings["outputFormat"],
                      } as Partial<ClaudeSettings>)
                    }
                  />
                )}

                {activeModel === "gemini" && (
                  <SettingsSelect
                    label="Output"
                    value={(settings as GeminiSettings).outputFormat}
                    options={[
                      { value: "", label: "default" },
                      { value: "text", label: "text" },
                      { value: "json", label: "json" },
                    ]}
                    onChange={(v) =>
                      handleChange({
                        outputFormat: (v || undefined) as GeminiSettings["outputFormat"],
                      } as Partial<GeminiSettings>)
                    }
                  />
                )}

                {/* Claude: system prompt */}
                {activeModel === "claude" && (
                  <div className="py-1.5">
                    <span className="text-xs text-zinc-400 block mb-1">System prompt</span>
                    <textarea
                      value={(settings as ClaudeSettings).systemPrompt ?? ""}
                      placeholder="Optional system prompt..."
                      rows={3}
                      onChange={(e) =>
                        handleChange(
                          { systemPrompt: e.target.value || undefined } as Partial<ClaudeSettings>,
                          true
                        )
                      }
                      className="w-full rounded bg-zinc-800 border border-zinc-700 focus:border-zinc-500 focus:outline-none px-2 py-1 text-xs text-zinc-200 resize-none"
                    />
                  </div>
                )}

                {/* Claude: bare mode */}
                {activeModel === "claude" && (
                  <SettingsToggle
                    label="Bare mode"
                    value={(settings as ClaudeSettings).bare}
                    onChange={(v) => handleChange({ bare: v } as Partial<ClaudeSettings>)}
                  />
                )}

                {/* Claude: no session persistence */}
                {activeModel === "claude" && (
                  <SettingsToggle
                    label="No persist"
                    value={(settings as ClaudeSettings).noSessionPersistence}
                    onChange={(v) => handleChange({ noSessionPersistence: v } as Partial<ClaudeSettings>)}
                  />
                )}

                {/* Codex: JSON output */}
                {activeModel === "codex" && (
                  <SettingsToggle
                    label="JSON output"
                    value={(settings as CodexSettings).json}
                    onChange={(v) => handleChange({ json: v } as Partial<CodexSettings>)}
                  />
                )}

                {/* Codex: provider */}
                {activeModel === "codex" && (
                  <SettingsInput
                    label="Provider"
                    value={(settings as CodexSettings).provider}
                    placeholder="openai"
                    onChange={(v) =>
                      handleChange({ provider: v || undefined } as Partial<CodexSettings>, true)
                    }
                  />
                )}
              </SettingsSection>
            </>
          )}
        </div>
      </div>
    </>
  );
}
