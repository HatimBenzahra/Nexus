import { Handle, Position } from "@xyflow/react";

interface TaskNodeData {
  label: string;
  status?: string;
  assignee?: string;
}

function statusColor(status?: string): string {
  switch (status) {
    case "in_progress": return "#4285f4";
    case "completed": return "#00c853";
    case "failed": return "#ef4444";
    default: return "#71717a";
  }
}

export function TaskNode({ data }: { data: TaskNodeData }) {
  const color = statusColor(data.status);
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg min-w-[120px]"
      style={{ borderColor: color, background: "#0a0a0a" }}
    >
      <Handle type="target" position={Position.Top} style={{ borderColor: color }} />
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
          task
        </span>
      </div>
      <div className="font-medium text-zinc-200 truncate max-w-[140px]">{data.label}</div>
      {data.status && (
        <div className="mt-1 text-[10px] text-zinc-500">{data.status}</div>
      )}
      {data.assignee && (
        <div className="text-[10px] text-zinc-600 truncate">→ {data.assignee}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ borderColor: color }} />
    </div>
  );
}
