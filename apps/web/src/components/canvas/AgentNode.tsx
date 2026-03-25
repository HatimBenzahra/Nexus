import { Handle, Position } from "@xyflow/react";

interface AgentNodeData {
  label: string;
  provider?: string;
  status?: string;
}

function providerColor(provider?: string): string {
  switch (provider) {
    case "claude": return "#ff9500";
    case "codex": return "#00c853";
    case "gemini": return "#4285f4";
    default: return "#a855f7";
  }
}

export function AgentNode({ data }: { data: AgentNodeData }) {
  const color = providerColor(data.provider);
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg min-w-[120px]"
      style={{ borderColor: color, background: "#0a0a0a" }}
    >
      <Handle type="target" position={Position.Top} style={{ borderColor: color }} />
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
          {data.provider ?? "agent"}
        </span>
      </div>
      <div className="font-medium text-zinc-200 truncate max-w-[140px]">{data.label}</div>
      {data.status && (
        <div className="mt-1 text-[10px] text-zinc-500">{data.status}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ borderColor: color }} />
    </div>
  );
}
