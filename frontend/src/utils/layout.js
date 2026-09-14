import dagre from "dagre";

/**
 * Dagre auto-layout overriding LLM coordinates.
 * LLM now only provides topology (nodes + edges); layout is deterministic.
 */
export function getLayoutedElements(nodes, edges, direction = "TB") {
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
  nodes.forEach((node) => {
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

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
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

  return { nodes: layoutedNodes, edges };
}
