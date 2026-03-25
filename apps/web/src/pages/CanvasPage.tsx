import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "../components/canvas/AgentNode";
import { TaskNode } from "../components/canvas/TaskNode";
import { SessionNode } from "../components/canvas/SessionNode";

const WORKSPACE_ID = "default";

const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  session: SessionNode,
};

interface CanvasNode {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string | null;
  label: string;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

interface CanvasEdge {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
  created_at: string;
}

function toFlowNode(n: CanvasNode): Node {
  return {
    id: n.id,
    type: n.entity_type === "agent" ? "agent" : n.entity_type === "task" ? "task" : "session",
    position: { x: n.x, y: n.y },
    data: { label: n.label },
  };
}

function toFlowEdge(e: CanvasEdge): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    label: e.label ?? undefined,
    style: { stroke: "#52525b", strokeWidth: 1.5 },
    labelStyle: { fill: "#71717a", fontSize: 10 },
  };
}

export function CanvasPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCanvas = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/canvas?workspace_id=${WORKSPACE_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { nodes: CanvasNode[]; edges: CanvasEdge[] };
      setNodes(data.nodes.map(toFlowNode));
      setEdges(data.edges.map(toFlowEdge));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    void fetchCanvas();
  }, [fetchCanvas]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/canvas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { nodes: CanvasNode[]; edges: CanvasEdge[] };
      setNodes(data.nodes.map(toFlowNode));
      setEdges(data.edges.map(toFlowEdge));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleNodesChange = useCallback(
    async (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === "position" && !change.dragging && change.position) {
          try {
            await fetch(`/api/canvas/nodes/${change.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ x: change.position.x, y: change.position.y }),
            });
          } catch {
            // silently ignore position save errors
          }
        }
      }
    },
    [onNodesChange]
  );

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <div className="mr-2 flex h-6 w-6 items-center justify-center rounded bg-purple-600 text-xs font-bold text-white">
          N
        </div>
        <span className="mr-4 text-sm font-medium text-zinc-400">Nexus</span>
        <span className="text-xs text-zinc-600">Canvas</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-md px-3 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 transition-all"
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <a
            href="/terminal"
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            Back to Terminal
          </a>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm z-10">
            Loading canvas...
          </div>
        )}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-md bg-red-900/80 px-3 py-1.5 text-xs text-red-300">
            {error}
          </div>
        )}
        {!loading && nodes.length === 0 && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600 text-sm z-10 pointer-events-none">
            <p>No nodes yet.</p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="pointer-events-auto rounded-md px-4 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-all"
            >
              Sync from DB
            </button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          style={{ background: "#0a0a0a" }}
        >
          <Background color="#27272a" gap={24} />
          <Controls style={{ background: "#18181b", border: "1px solid #27272a" }} />
          <MiniMap
            style={{ background: "#18181b", border: "1px solid #27272a" }}
            nodeColor={() => "#52525b"}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
