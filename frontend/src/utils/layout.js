import dagre from "dagre";

/**
 * Dagre auto-layout overriding LLM coordinates.
 * LLM now only provides topology (nodes + edges); layout is deterministic.
 */
export function getLayoutedElements(nodes, edges, direction = "TB") {
  // Dagre crashes ("setting 'order'") when an edge endpoint is not in the graph —
  // drop malformed nodes and dangling edges before layout.
  const safeNodes = (nodes || []).filter((n) => n && n.id != null && n.id !== "");
  const nodeIds = new Set(safeNodes.map((n) => n.id));
  const safeEdges = (edges || []).filter(
    (e) => e && e.source != null && e.target != null && nodeIds.has(e.source) && nodeIds.has(e.target)
  );

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
    const label = node.data?.label || "";
    const lineCount = Math.max(1, label.split("\n").length, Math.ceil(label.length / 22));
    const shape = node.data?.shape || "rectangle";
    let defaultW = 172;
    let defaultH = Math.max(64, 40 + lineCount * 18);
    if (shape === "circle") {
      defaultW = 130;
      defaultH = 130;
    }
    const w = node.measured?.width || defaultW;
    const h = node.measured?.height || defaultH;
    g.setNode(node.id, { width: w, height: h });
  });

  safeEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = safeNodes.map((node) => {
    const pos = g.node(node.id) || { x: 0, y: 0 };
    const label = node.data?.label || "";
    const lineCount = Math.max(1, label.split("\n").length, Math.ceil(label.length / 22));
    const shape = node.data?.shape || "rectangle";
    let defaultW = 172;
    let defaultH = Math.max(64, 40 + lineCount * 18);
    if (shape === "circle") {
      defaultW = 130;
      defaultH = 130;
    }
    const w = node.measured?.width || defaultW;
    const h = node.measured?.height || defaultH;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges: safeEdges };
}
