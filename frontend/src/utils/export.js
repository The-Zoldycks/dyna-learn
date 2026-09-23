/**
 * Diagram export & share utilities.
 * Handles SVG composition, PNG rasterization, and compact share URL encoding/decoding.
 */

/**
 * Escapes XML special characters.
 */
function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Pure SVG builder for exporting diagrams as standalone vector files or rasterizing to PNG.
 */
export function buildDiagramSVG(exportNodes = [], exportEdges = []) {
  if (!exportNodes.length) return null;

  const PAD = 48;
  const xs = exportNodes.map((n) => n.position.x);
  const ys = exportNodes.map((n) => n.position.y);
  const ws = exportNodes.map((n) => n.measured?.width || 172);
  const hs = exportNodes.map((n) => n.measured?.height || 64);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs.map((x, i) => x + ws[i])) + PAD;
  const maxY = Math.max(...ys.map((y, i) => y + hs[i])) + PAD;
  const W = Math.max(200, maxX - minX);
  const H = Math.max(120, maxY - minY);

  const nodeColor = (n) =>
    n.data?.highlight
      ? { fill: "#fef2f2", stroke: "#ef4444", text: "#b91c1c" }
      : { fill: "#ffffff", stroke: "#818cf8", text: "#1e293b" };

  const edgeSvg = exportEdges
    .map((e) => {
      const src = exportNodes.find((n) => n.id === e.source);
      const tgt = exportNodes.find((n) => n.id === e.target);
      if (!src || !tgt) return "";
      const sw = src.measured?.width || 172;
      const sh = src.measured?.height || 64;
      const tw = tgt.measured?.width || 172;

      // Bottom-centre of source → top-centre of target
      const x1 = src.position.x + sw / 2 - minX;
      const y1 = src.position.y + sh - minY;
      const x2 = tgt.position.x + tw / 2 - minX;
      const y2 = tgt.position.y - minY;
      const cy = (y1 + y2) / 2;
      const path = `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
      const cleanEdgeLabel = escapeXml(e.label || "");
      const label = cleanEdgeLabel
        ? `<text x="${(x1 + x2) / 2}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${cleanEdgeLabel}</text>`
        : "";
      return `<path d="${path}" fill="none" stroke="#818cf8" stroke-width="2" marker-end="url(#arrow)"/>${label}`;
    })
    .join("\n");

  const nodeSvg = exportNodes
    .map((n) => {
      const nw = n.measured?.width || 172;
      const nh = n.measured?.height || 64;
      const x = n.position.x - minX;
      const y = n.position.y - minY;
      const cx = x + nw / 2;
      const cy = y + nh / 2;
      const c = nodeColor(n);
      const label = escapeXml(n.data?.label || "");
      const lines = label.split("\n");
      const shape = n.data?.shape || "rectangle";

      let shapeEl = "";
      if (shape === "pill") {
        shapeEl = `<rect x="${x}" y="${y}" width="${nw}" height="${nh}" rx="${nh / 2}" ry="${nh / 2}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>`;
      } else if (shape === "circle") {
        const r = Math.min(nw, nh) / 2;
        shapeEl = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>`;
      } else if (shape === "diamond") {
        shapeEl = `<polygon points="${cx},${y} ${x + nw},${cy} ${cx},${y + nh} ${x},${cy}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>`;
      } else {
        shapeEl = `<rect x="${x}" y="${y}" width="${nw}" height="${nh}" rx="10" ry="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>`;
      }

      const lineH = 14;
      const startY = cy - ((lines.length - 1) * lineH) / 2;
      const textEl = lines
        .map(
          (ln, i) =>
            `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="${c.text}" font-family="system-ui,sans-serif">${ln}</text>`
        )
        .join("\n");

      const dot =
        c.stroke === "#ef4444"
          ? `<circle cx="${x + nw - 5}" cy="${y + 5}" r="4" fill="#ef4444"/>`
          : "";

      return `${shapeEl}\n${textEl}\n${dot}`;
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#818cf8"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <!-- Edges -->
  ${edgeSvg}
  <!-- Nodes -->
  ${nodeSvg}
  <!-- Footer -->
  <text x="${W - 12}" y="${H - 10}" text-anchor="end" font-size="10" fill="#94a3b8" font-family="system-ui,sans-serif">Dyna-learn · ${new Date().toLocaleDateString()}</text>
</svg>`;

  return { text: svg, W, H };
}

/**
 * Rasterize SVG text to a PNG blob using an in-memory canvas.
 */
export function svgToPngBlob(svg, W, H, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(W * scale);
        canvas.height = Math.round(H * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not acquire 2D canvas context");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
          "image/png"
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG rasterization failed"));
    };
    img.src = url;
  });
}

/**
 * Compresses canvas topology into a compact base64 hash payload (~65% smaller than raw JSON).
 */
export function encodeShareHash(nodes = [], edges = []) {
  const compactNodes = nodes.map((n) => [
    n.id,
    n.data?.label || "",
    n.data?.icon || "",
    n.data?.shape || "",
    n.data?.highlight ? 1 : 0,
    Math.round(n.position?.x || 0),
    Math.round(n.position?.y || 0),
  ]);
  const compactEdges = edges.map((e) => [
    e.id,
    e.source,
    e.target,
    e.label || "",
  ]);

  const payload = { v: 2, n: compactNodes, e: compactEdges };
  const jsonStr = JSON.stringify(payload);
  return window.btoa(unescape(encodeURIComponent(jsonStr)));
}

/**
 * Decodes a shared canvas hash string, supporting both compact v2 and legacy schemas.
 */
export function decodeShareHash(rawPayload = "") {
  if (!rawPayload) return null;
  const jsonStr = decodeURIComponent(escape(window.atob(rawPayload)));
  const data = JSON.parse(jsonStr);

  // Compact v2 format
  if (data.v === 2 && Array.isArray(data.n) && Array.isArray(data.e)) {
    const nodes = data.n.map((row) => ({
      id: row[0],
      data: {
        label: row[1],
        icon: row[2] || undefined,
        shape: row[3] || undefined,
        highlight: !!row[4],
      },
      position: { x: row[5] ?? 0, y: row[6] ?? 0 },
      type: "custom",
    }));
    const edges = data.e.map((row) => ({
      id: row[0],
      source: row[1],
      target: row[2],
      label: row[3] || undefined,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#8b5cf6", strokeWidth: 2, strokeDasharray: "5, 5" },
    }));
    return { nodes, edges };
  }

  // Legacy schema backwards compatibility
  if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
    return { nodes: data.nodes, edges: data.edges };
  }

  return null;
}

/**
 * Builds an Anki-compatible CSV string from canvas nodes and edges.
 * Format: "Front","Back","Tags"
 */
export function buildAnkiCSV(nodes = [], edges = []) {
  const realNodes = nodes.filter((n) => n.id !== "start");
  if (realNodes.length === 0) return "";

  // Map nodeId -> list of connected node descriptions
  const connections = new Map();
  edges.forEach((e) => {
    const srcNode = nodes.find((n) => n.id === e.source);
    const tgtNode = nodes.find((n) => n.id === e.target);
    if (srcNode && tgtNode) {
      const srcLabel = (srcNode.data?.label || srcNode.id).replace(/\n/g, " ");
      const tgtLabel = (tgtNode.data?.label || tgtNode.id).replace(/\n/g, " ");
      const edgeDesc = e.label ? ` (${e.label})` : "";

      if (!connections.has(srcNode.id)) connections.set(srcNode.id, []);
      connections.get(srcNode.id).push(`Leads to: ${tgtLabel}${edgeDesc}`);

      if (!connections.has(tgtNode.id)) connections.set(tgtNode.id, []);
      connections.get(tgtNode.id).push(`Originates from: ${srcLabel}${edgeDesc}`);
    }
  });

  const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
  const rows = [["Front", "Back", "Tags"].map(escapeCsv).join(",")];

  const escapeHtml = (str = "") =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  realNodes.forEach((n) => {
    const label = (n.data?.label || n.id).replace(/\n/g, " ");
    const related = connections.get(n.id) || ["Core concept in this diagram"];
    const backHtml = `<div><strong>${escapeHtml(label)}</strong><br/><ul>${related.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>`;
    const tag = n.data?.highlight ? "dyna-learn #needs-review" : "dyna-learn";

    rows.push([escapeCsv(label), escapeCsv(backHtml), escapeCsv(tag)].join(","));
  });

  return rows.join("\r\n");
}
