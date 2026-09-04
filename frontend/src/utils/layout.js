import dagre from "dagre";

/**
 * Dagre auto-layout overriding LLM coordinates.
 * LLM now only provides topology (nodes + edges); layout is deterministic.
 */
export function getLayoutedElements(nodes, edges, direction = "TB") {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === "LR";
  g.setGraph({
    rankdir: direction,
    nodesep: 90,
    ranksep: 110,
    marginx: 40,
    marginy: 40,
  });

  // dagre needs width/height per node — align with CustomNode ~170x64
  nodes.forEach((node) => {
    const w = node.measured?.width || 172;
    const h = node.measured?.height || 64;
    g.setNode(node.id, { width: w, height: h });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (node.measured?.width || 172) / 2,
        y: pos.y - (node.measured?.height || 64) / 2,
      },
      // preserve original data but ensure position is layout-derived
    };
  });

  return { nodes: layoutedNodes, edges };
}
