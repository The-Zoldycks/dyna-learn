import dagre from "dagre";

/**
 * Dagre auto-layout overriding LLM coordinates.
 * LLM now only provides topology (nodes + edges); layout is deterministic.
 */
// Dagre keys plain objects by node id internally, so ids colliding with
// Object.prototype ("constructor", "toString", "__proto__", ...) corrupt its
// bookkeeping and crash layout ("setting 'order'"). LLM-provided ids are
// arbitrary English words, so hand dagre surrogate keys and map back after.
const LAYOUT_ID_PREFIX = "layout:";

function estimateSize(node) {
  const label = node.data?.label || "";
  const lineCount = Math.max(1, label.split("\n").length, Math.ceil(label.length / 22));
  const shape = node.data?.shape || "rectangle";
  if (shape === "circle") return { w: 130, h: 130 };
  return { w: 172, h: Math.max(64, 40 + lineCount * 18) };
}

export function getLayoutedElements(nodes, edges, direction = "TB") {
  // Drop malformed nodes and dangling edges before layout.
  const safeNodes = (nodes || []).filter((n) => n && n.id != null && n.id !== "");
  const nodeIds = new Set(safeNodes.map((n) => n.id));
  const safeEdges = (edges || []).filter(
    (e) => e && e.source != null && e.target != null && nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const toLayoutId = (id) => `${LAYOUT_ID_PREFIX}${String(id)}`;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 90,
    ranksep: 110,
    marginx: 40,
    marginy: 40,
  });

  // dagre needs width/height per node — estimate dynamically if unmeasured
  safeNodes.forEach((node) => {
    const { w, h } = estimateSize(node);
    g.setNode(toLayoutId(node.id), { width: node.measured?.width || w, height: node.measured?.height || h });
  });

  safeEdges.forEach((edge) => {
    g.setEdge(toLayoutId(edge.source), toLayoutId(edge.target));
  });

  try {
    dagre.layout(g);
  } catch (err) {
    // Never let layout take down the canvas — keep existing positions.
    console.warn("[layout] dagre failed, keeping existing positions:", err);
    return { nodes: safeNodes, edges: safeEdges };
  }

  const layoutedNodes = safeNodes.map((node) => {
    const pos = g.node(toLayoutId(node.id)) || { x: 0, y: 0 };
    const { w, h } = estimateSize(node);
    const width = node.measured?.width || w;
    const height = node.measured?.height || h;
    return {
      ...node,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges: safeEdges };
}
