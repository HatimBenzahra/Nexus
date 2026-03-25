import { Router } from "express";
import {
  canvasRepo,
  agentRepo,
  sessionRepo,
  taskRepo,
} from "../db/repositories/index.js";

export const canvasRoutes = Router();

// GET / — get all nodes + edges for workspace
canvasRoutes.get("/", (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string;
    if (!workspaceId) {
      res.status(400).json({ error: "workspace_id is required" });
      return;
    }
    const nodes = canvasRepo.getNodes(workspaceId);
    const edges = canvasRepo.getEdges(workspaceId);
    res.json({ nodes, edges });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /nodes — create node
canvasRoutes.post("/nodes", (req, res) => {
  try {
    const { workspace_id, entity_type, entity_id, label, x, y } = req.body;
    if (!workspace_id || !entity_type || !label) {
      res.status(400).json({ error: "workspace_id, entity_type, and label are required" });
      return;
    }
    const node = canvasRepo.createNode({ workspace_id, entity_type, entity_id, label, x, y });
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /nodes/:id — update node position/label
canvasRoutes.put("/nodes/:id", (req, res) => {
  try {
    const { x, y, label } = req.body;
    const node = canvasRepo.updateNode(req.params.id, { x, y, label });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /nodes/:id — delete node
canvasRoutes.delete("/nodes/:id", (req, res) => {
  try {
    canvasRepo.removeNode(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /edges — create edge
canvasRoutes.post("/edges", (req, res) => {
  try {
    const { workspace_id, source_node_id, target_node_id, edge_type, label } = req.body;
    if (!workspace_id || !source_node_id || !target_node_id) {
      res.status(400).json({ error: "workspace_id, source_node_id, and target_node_id are required" });
      return;
    }
    const edge = canvasRepo.createEdge({ workspace_id, source_node_id, target_node_id, edge_type, label });
    res.status(201).json(edge);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /edges/:id — delete edge
canvasRoutes.delete("/edges/:id", (req, res) => {
  try {
    canvasRepo.removeEdge(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /sync — auto-populate canvas from DB entities
canvasRoutes.post("/sync", (req, res) => {
  try {
    const { workspace_id } = req.body;
    if (!workspace_id) {
      res.status(400).json({ error: "workspace_id is required" });
      return;
    }

    const existingNodes = canvasRepo.getNodes(workspace_id);
    const existingEdges = canvasRepo.getEdges(workspace_id);

    // Build a map of entity_id -> node for quick lookup
    const entityNodeMap = new Map<string, string>(); // entity_id -> node.id
    for (const node of existingNodes) {
      if (node.entity_id) {
        entityNodeMap.set(node.entity_id, node.id);
      }
    }

    // Track edges already present (source+target pairs)
    const existingEdgeSet = new Set<string>();
    for (const edge of existingEdges) {
      existingEdgeSet.add(`${edge.source_node_id}:${edge.target_node_id}`);
    }

    const agents = agentRepo.findByWorkspace(workspace_id);
    const sessions = sessionRepo.findByWorkspace(workspace_id);
    const tasks = taskRepo.findByWorkspace(workspace_id);

    const createdNodes: ReturnType<typeof canvasRepo.createNode>[] = [];
    const createdEdges: ReturnType<typeof canvasRepo.createEdge>[] = [];

    // Grid layout state
    let col = 0;
    let row = 0;
    const COLS = 4;

    function nextPosition() {
      const x = col * 300;
      const y = row * 200;
      col++;
      if (col >= COLS) { col = 0; row++; }
      return { x, y };
    }

    // Create agent nodes
    for (const agent of agents) {
      if (!entityNodeMap.has(agent.id)) {
        const pos = nextPosition();
        const node = canvasRepo.createNode({
          workspace_id,
          entity_type: "agent",
          entity_id: agent.id,
          label: agent.name,
          x: pos.x,
          y: pos.y,
        });
        createdNodes.push(node);
        entityNodeMap.set(agent.id, node.id);
      }
    }

    // Create session nodes
    for (const session of sessions) {
      if (!entityNodeMap.has(session.id)) {
        const pos = nextPosition();
        const node = canvasRepo.createNode({
          workspace_id,
          entity_type: "session",
          entity_id: session.id,
          label: session.title || "Untitled Session",
          x: pos.x,
          y: pos.y,
        });
        createdNodes.push(node);
        entityNodeMap.set(session.id, node.id);
      }
    }

    // Create task nodes
    for (const task of tasks) {
      if (!entityNodeMap.has(task.id)) {
        const pos = nextPosition();
        const node = canvasRepo.createNode({
          workspace_id,
          entity_type: "task",
          entity_id: task.id,
          label: task.title,
          x: pos.x,
          y: pos.y,
        });
        createdNodes.push(node);
        entityNodeMap.set(task.id, node.id);
      }
    }

    // Create edges: task.assigned_to -> agent
    for (const task of tasks) {
      if (task.assigned_to && entityNodeMap.has(task.id) && entityNodeMap.has(task.assigned_to)) {
        const srcNodeId = entityNodeMap.get(task.id)!;
        const tgtNodeId = entityNodeMap.get(task.assigned_to)!;
        const key = `${srcNodeId}:${tgtNodeId}`;
        if (!existingEdgeSet.has(key)) {
          const edge = canvasRepo.createEdge({
            workspace_id,
            source_node_id: srcNodeId,
            target_node_id: tgtNodeId,
            edge_type: "assignment",
            label: "assigned to",
          });
          createdEdges.push(edge);
          existingEdgeSet.add(key);
        }
      }
    }

    // Create edges: session.primary_agent_id -> agent
    for (const session of sessions) {
      if (session.primary_agent_id && entityNodeMap.has(session.id) && entityNodeMap.has(session.primary_agent_id)) {
        const srcNodeId = entityNodeMap.get(session.id)!;
        const tgtNodeId = entityNodeMap.get(session.primary_agent_id)!;
        const key = `${srcNodeId}:${tgtNodeId}`;
        if (!existingEdgeSet.has(key)) {
          const edge = canvasRepo.createEdge({
            workspace_id,
            source_node_id: srcNodeId,
            target_node_id: tgtNodeId,
            edge_type: "primary_agent",
            label: "primary agent",
          });
          createdEdges.push(edge);
          existingEdgeSet.add(key);
        }
      }
    }

    const allNodes = canvasRepo.getNodes(workspace_id);
    const allEdges = canvasRepo.getEdges(workspace_id);

    res.json({
      created: { nodes: createdNodes.length, edges: createdEdges.length },
      total: { nodes: allNodes.length, edges: allEdges.length },
      nodes: allNodes,
      edges: allEdges,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
