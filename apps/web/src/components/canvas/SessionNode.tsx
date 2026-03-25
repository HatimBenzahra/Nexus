import { Handle, Position } from "@xyflow/react";

interface SessionNodeData {
  label: string;
  date?: string;
}

const SESSION_COLOR = "#a855f7";

export function SessionNode({ data }: { data: SessionNodeData }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg min-w-[120px]"
      style={{ borderColor: SESSION_COLOR, background: "#0a0a0a" }}
    >
      <Handle type="target" position={Position.Top} style={{ borderColor: SESSION_COLOR }} />
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: SESSION_COLOR }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: SESSION_COLOR }}>
          session
        </span>
      </div>
      <div className="font-medium text-zinc-200 truncate max-w-[140px]">{data.label}</div>
      {data.date && (
        <div className="mt-1 text-[10px] text-zinc-500">
          {new Date(data.date).toLocaleDateString()}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ borderColor: SESSION_COLOR }} />
    </div>
  );
}
