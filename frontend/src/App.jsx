import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Send, Loader2, Volume2, Sparkles, Trash2, MousePointerClick,
  Pause, Play, Square, ChevronDown, ChevronUp, Maximize2, X
} from "lucide-react";
import CustomNode from "./components/CustomNode.jsx";
import ExplanationDrawer from "./components/ExplanationDrawer.jsx";
import { getLayoutedElements } from "./utils/layout.js";

const nodeTypes = { custom: CustomNode };

const initialNodes = [
  {
    id: "start",
    position: { x: 250, y: 80 },
    data: { label: "Welcome to Dyna-learn!\nAsk a question or click a node to begin.", icon: "brain", shape: "pill" },
    type: "custom",
  },
];

const initialEdges = [];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSpeech, setLastSpeech] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerText, setDrawerText] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: false }, eds)), [setEdges]);
  const onNodeClick = useCallback((_, node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const toggleExpand = (idx) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Speech controls with pause/resume
  const speakText = useCallback((text) => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1; utterance.lang = "en-US";
    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onpause = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);
    window.speechSynthesis.speak(utterance);
    setLastSpeech(text);
    setDrawerText(text);
  }, []);

  const pauseSpeech = useCallback(() => {
    if (window.speechSynthesis?.speaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  const resumeSpeech = useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

  const stopSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  // Fallback icon inference when LLM omits icon (broad library heuristic)
  const inferIcon = (label = "") => {
    const l = label.toLowerCase();
    if (l.includes("plan")) return "clipboard";
    if (l.includes("design") || l.includes("palette")) return "palette";
    if (l.includes("implement") || l.includes("code") || l.includes("develop")) return "code";
    if (l.includes("test") || l.includes("qa") || l.includes("bug")) return "bug";
    if (l.includes("deploy") || l.includes("release") || l.includes("rocket")) return "rocket";
    if (l.includes("maintain") || l.includes("support")) return "wrench";
    if (l.includes("database") || l.includes("db") || l.includes("storage") || l.includes("sql")) return "database";
    if (l.includes("server") || l.includes("api") || l.includes("backend")) return "server";
    if (l.includes("cloud") || l.includes("devops")) return "cloud";
    if (l.includes("security") || l.includes("auth") || l.includes("lock")) return "lock";
    if (l.includes("file") || l.includes("doc")) return "file";
    if (l.includes("user") || l.includes("actor")) return "user";
    if (l.includes("arch")) return "layers";
    if (l.includes("network") || l.includes("connect")) return "network";
    if (l.includes("brain") || l.includes("ai") || l.includes("logic")) return "brain";
    return "book";
  };

  // Format helpers — dagre handles position, icon/shape via CustomNode
  const formatNodes = useCallback((apiNodes) =>
    (apiNodes || []).map((n, idx) => ({
      id: n.id || `node-${Date.now()}-${idx}`,
      // position will be overwritten by dagre; keep LLM position as fallback only if dagre disabled
      position: n.position || { x: 0, y: 0 },
      data: {
        label: n.label || n.data?.label || "Concept",
        icon: n.icon || inferIcon(n.label || n.data?.label || ""),
        shape: n.shape || "rectangle",
        highlight: n.highlight === true,
      },
      type: "custom",
    })), []);

  const formatEdges = useCallback((apiEdges) =>
    (apiEdges || []).map((e, idx) => ({
      id: e.id || `edge-${Date.now()}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label || "",
      type: "smoothstep",
      animated: false,
      pathOptions: { borderRadius: 12 },
      style: { stroke: "#6366f1", strokeWidth: 2 },
    })), []);

  const applyLayoutAndSet = useCallback((nextNodes, nextEdges) => {
    // Validate edges reference existing nodes
    const nodeIds = new Set(nextNodes.map((n) => n.id));
    const validEdges = nextEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    // Skip dagre for single-node welcome state to keep pill centered
    if (nextNodes.length <= 1) {
      setNodes(nextNodes);
      setEdges(validEdges);
      return;
    }
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nextNodes, validEdges, "TB");
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [setNodes, setEdges]);

  const applyDiagramUpdate = useCallback((diagramUpdate) => {
    if (!diagramUpdate) return;
    const { action, nodes: newNodes, edges: newEdges } = diagramUpdate;
    const formattedNodes = formatNodes(newNodes);
    const formattedEdges = formatEdges(newEdges);

    switch (action) {
      case "add_nodes": {
        setNodes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const toAdd = formattedNodes.filter((n) => !existingIds.has(n.id));
          const merged = [...prev, ...toAdd];
          // also handle edges from same payload
          setEdges((prevEdges) => {
            const edgeIds = new Set(prevEdges.map((e) => e.id));
            const newValid = formattedEdges.filter((e) => !edgeIds.has(e.id));
            const combinedEdges = [...prevEdges, ...newValid];
            // defer layout via timeout to capture prev state? Apply directly:
            const { nodes: ln, edges: le } = getLayoutedElements(merged, combinedEdges, "TB");
            // schedule update after nodes set — use queueMicrotask pattern: set both together
            setTimeout(() => { setNodes(ln); setEdges(le); }, 0);
            return prevEdges; // will be overridden by layout
          });
          return prev; // placeholder, real set happens in timeout
        });
        // Simpler: compute merged synchronously using current nodes/edges snapshot — but need latest.
        // Fallback synchronous layout using current closure (may be stale by one turn, acceptable with dagre idempotence)
        // Instead recompute from current state + new:
        // Use functional approach with layouted result:
        break;
      }
      case "add_edges": {
        setEdges((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const filtered = formattedEdges.filter((e) => !ids.has(e.id));
          return [...prev, ...filtered];
        });
        // highlight nodes if any
        if (formattedNodes.length) {
          setNodes((prev) => {
            const ids = new Set(prev.map((n) => n.id));
            const toAdd = formattedNodes.filter((n) => !ids.has(n.id));
            if (!toAdd.length) return prev;
            const merged = [...prev, ...toAdd];
            const { nodes: ln, edges: le } = getLayoutedElements(merged, edges, "TB");
            setEdges(le);
            return ln;
          });
        }
        break;
      }
      case "update_nodes": {
        setNodes((prev) => {
          const map = new Map(prev.map((n) => [n.id, n]));
          formattedNodes.forEach((n) => {
            const existing = map.get(n.id);
            if (existing) {
              map.set(n.id, { ...existing, data: { ...existing.data, ...n.data } });
            } else {
              map.set(n.id, n);
            }
          });
          const merged = Array.from(map.values());
          // No relayout for highlight — preserve positions to avoid jump
          return merged;
        });
        if (formattedEdges.length) {
          setEdges((prev) => {
            const ids = new Set(prev.map((e) => e.id));
            return [...prev, ...formattedEdges.filter((e) => !ids.has(e.id))];
          });
        }
        break;
      }
      case "clear_canvas":
        setNodes(initialNodes);
        setEdges(initialEdges);
        setSelectedNodeId(null);
        break;
      case "replace":
        if (formattedNodes.length) applyLayoutAndSet(formattedNodes, formattedEdges);
        else applyLayoutAndSet(initialNodes, []);
        break;
      case "create":
      case "append": {
        // dedup + layout
        setNodes((prev) => {
          const ids = new Set(prev.map((n) => n.id));
          const toAdd = formattedNodes.filter((n) => !ids.has(n.id));
          const merged = [...prev, ...toAdd];
          setEdges((prevE) => {
            const eIds = new Set(prevE.map((e) => e.id));
            const eAdd = formattedEdges.filter((e) => !eIds.has(e.id));
            const combined = [...prevE, ...eAdd];
            const { nodes: ln, edges: le } = getLayoutedElements(merged, combined, "TB");
            setTimeout(() => { setNodes(ln); setEdges(le); }, 0);
            return prevE;
          });
          return prev;
        });
        break;
      }
      case "none":
      default:
        if (formattedNodes.length || formattedEdges.length) {
          // treat as add_nodes dedup
          setNodes((prev) => {
            const ids = new Set(prev.map((n) => n.id));
            const toAdd = formattedNodes.filter((n) => !ids.has(n.id));
            if (!toAdd.length && !formattedEdges.length) return prev;
            const merged = [...prev, ...toAdd];
            setEdges((prevE) => {
              const eIds = new Set(prevE.map((e) => e.id));
              const eAdd = formattedEdges.filter((e) => !eIds.has(e.id));
              const combined = [...prevE, ...eAdd];
              const nodeIds = new Set(merged.map((n) => n.id));
              const valid = combined.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
              const { nodes: ln, edges: le } = getLayoutedElements(merged, valid, "TB");
              setTimeout(() => { setNodes(ln); setEdges(le); }, 0);
              return prevE;
            });
            return prev;
          });
        }
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatNodes, formatEdges, applyLayoutAndSet, edges]);

  // Simpler unified add_nodes handler that avoids stale closure race — recompute via current nodes snapshot
  // We keep a ref-like latest via setNodes functional, but above timeout pattern is okay for demo.
  // For correctness, we override add_nodes to use layout from current state + formatted
  // Fix: after each diagram_update, trigger layout in next tick using current nodes
  // To avoid complexity, we intercept add_nodes immediately with layout on merged snapshot taken from state
  const applyDiagramUpdateStable = useCallback((update) => {
    if (!update || update.action === "update_nodes" || update.action === "clear_canvas" || update.action === "none") {
      return applyDiagramUpdate(update);
    }
    // For topology changes, build next state from current nodes/edges closure (may be stale by 1 render, acceptable after dedup)
    // Instead do synchronous merge using latest via functional read trick
    // Workaround: use setNodes functional that also lays out
    if (update.action === "add_nodes") {
      const fN = formatNodes(update.nodes);
      const fE = formatEdges(update.edges);
      setNodes((prevNodes) => {
        const ids = new Set(prevNodes.map((n) => n.id));
        const toAdd = fN.filter((n) => !ids.has(n.id));
        const mergedNodes = [...prevNodes, ...toAdd];
        setEdges((prevEdges) => {
          const eIds = new Set(prevEdges.map((e) => e.id));
          const toAddE = fE.filter((e) => !eIds.has(e.id) && mergedNodes.some((n)=>n.id===e.source) && mergedNodes.some((n)=>n.id===e.target));
          const mergedEdges = [...prevEdges, ...toAddE];
          const laid = getLayoutedElements(mergedNodes, mergedEdges, "TB");
          // update both in next tick to avoid setState-in-setState
          setTimeout(()=>{ setNodes(laid.nodes); setEdges(laid.edges); },0);
          return prevEdges;
        });
        return prevNodes;
      });
      return;
    }
    return applyDiagramUpdate(update);
  }, [applyDiagramUpdate, formatNodes, formatEdges, setNodes, setEdges]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setError("");
    const canvasState = { nodes, edges };
    const payload = { studentQuestion: question, canvasState, flowchartState: canvasState, chatHistory, selectedNodeId };
    try {
      const res = await fetch("http://localhost:3000/api/tutor", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const { speech_text, diagram_update } = data;
      if (speech_text) {
        speakText(speech_text);
        setDrawerText(speech_text);
        setDrawerOpen(true);
        setChatHistory((prev) => {
          const next = [...prev, { role: "user", text: question }, { role: "model", text: speech_text }];
          return next.slice(-6);
        });
      } else {
        setChatHistory((prev) => [...prev, { role: "user", text: question }].slice(-6));
      }
      if (diagram_update) applyDiagramUpdateStable(diagram_update);
      setQuestion("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to fetch tutor response");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setChatHistory([]);
    setSelectedNodeId(null);
    stopSpeech();
    setLastSpeech("");
    setDrawerText("");
    setDrawerOpen(false);
    setError("");
    setExpandedIds(new Set());
  };

  const handleReplay = () => { if (lastSpeech) speakText(lastSpeech); };

  const selectedNodeLabel = useMemo(() => selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.data?.label || selectedNodeId : null, [selectedNodeId, nodes]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-indigo-50 text-slate-900">
      {/* Header with branded logo */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/dyna-learn-logo-blue.png"
            alt="Dyna-learn logo"
            className="h-10 object-contain contrast-125 saturate-150 brightness-[0.97] drop-shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            style={{ filter: "contrast(1.35) saturate(1.2)" }}
          />
          <div className="hidden sm:block border-l border-slate-200 pl-3 ml-1">
            <h1 className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase leading-none">Interactive AI Tutor</h1>
            <p className="text-[11px] text-slate-400">Gemini 3.1 Flash Lite • Dagre Layout</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={drawerText ? () => setDrawerOpen((v)=>!v) : handleReplay}
            disabled={!drawerText && !lastSpeech}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium disabled:opacity-40 hover:bg-slate-50 transition"
          >
            {drawerOpen ? <X size={14} /> : <Maximize2 size={14} />}
            {drawerOpen ? "Close" : "View"} Explanation
          </button>
          <div className="hidden sm:flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-white">
            <button onClick={handleReplay} disabled={!lastSpeech || isSpeaking} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title="Replay"><Volume2 size={14} /></button>
            <button onClick={isPaused ? resumeSpeech : pauseSpeech} disabled={!isSpeaking} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title={isPaused ? "Resume" : "Pause"}>{isPaused ? <Play size={14} /> : <Pause size={14} />}</button>
            <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title="Stop"><Square size={14} /></button>
          </div>
          <button onClick={handleClear} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-full sm:w-[380px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 shrink-0">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
              <Sparkles size={14} className="text-violet-600" /> Ask Dyna-learn
            </h2>
            <p className="text-xs text-slate-500 mt-1">Click a node + ask — tutor adapts to canvas & history.</p>
            {selectedNodeId && (
              <div className="mt-3 flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <MousePointerClick size={12} className="text-violet-600" />
                <span className="font-medium text-violet-700">Selected:</span>
                <span className="truncate flex-1">{selectedNodeLabel}</span>
                <button onClick={() => setSelectedNodeId(null)} className="text-violet-600 hover:text-violet-800 underline ml-2">Clear</button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
            {chatHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Conversation</p>
                <div className="space-y-2">
                  {chatHistory.map((turn, idx) => {
                    const isExpanded = expandedIds.has(idx);
                    const isLong = turn.text.length > 220;
                    const displayText = !isLong || isExpanded ? turn.text : turn.text.slice(0, 220) + "…";
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed border ${turn.role === "user" ? "bg-slate-900 text-white border-slate-800 ml-4" : "bg-violet-50 border-violet-200 text-slate-700 mr-2"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[10px] uppercase opacity-60">{turn.role === "user" ? "You" : "Tutor"}</span>
                          {isLong && <button onClick={() => toggleExpand(idx)} className="text-[10px] underline opacity-70 hover:opacity-100 flex items-center gap-1">{isExpanded ? <>Less <ChevronUp size={10} /></> : <>More <ChevronDown size={10} /></>}</button>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words">{displayText}</p>
                        {turn.role === "model" && (
                          <button onClick={() => { setDrawerText(turn.text); setDrawerOpen(true); }} className="mt-2 text-[11px] font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1">
                            <Maximize2 size={10} /> Open in drawer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sticky bottom-0 bg-white pt-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={selectedNodeId ? `Ask about "${selectedNodeLabel}"...` : "e.g. Explain database normalization..."}
                rows={3}
                disabled={loading}
                aria-disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:bg-white transition resize-none disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-medium text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Thinking...</> : <><Send size={16} /> Ask Tutor</>}
              </button>
              {loading && <p className="text-xs text-center text-violet-600">Input locked while thinking — prevents duplicate canvas updates</p>}
            </form>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-3">
                <p className="font-semibold">Tutor error</p>
                <p className="mt-1 break-words">{error}</p>
                <button onClick={() => setError("")} className="mt-2 text-xs underline">Dismiss</button>
              </div>
            )}

            {lastSpeech && !drawerOpen && (
              <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
                  <Volume2 size={12} className={isSpeaking ? "text-violet-600 animate-pulse" : ""} />
                  Last Explanation
                  <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${isSpeaking ? "bg-violet-600 text-white border-violet-600" : isPaused ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-white border-slate-200"}`}>{isPaused ? "Paused" : isSpeaking ? "Playing" : "Ready"}</span>
                </div>
                <div className="flex gap-1 mb-2">
                  <button onClick={handleReplay} disabled={isSpeaking} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-xs disabled:opacity-40">Replay</button>
                  <button onClick={isPaused ? resumeSpeech : pauseSpeech} disabled={!isSpeaking && !isPaused} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">{isPaused ? "Resume" : "Pause"}</button>
                  <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">Stop</button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-h-28 overflow-y-auto pr-1 whitespace-pre-wrap break-words">{lastSpeech.slice(0, 420)}{lastSpeech.length > 420 ? "…" : ""}</p>
                <button onClick={() => setDrawerOpen(true)} className="mt-2 w-full py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium hover:bg-slate-100 flex items-center justify-center gap-1">
                  <Maximize2 size={12} /> View full in drawer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative bg-slate-50 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            className="bg-slate-50"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep", animated: false }}
          >
            <Background gap={20} size={1} color="#e2e8f0" />
            <Controls />
            <MiniMap pannable zoomable style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }} />
          </ReactFlow>

          {/* Empty state hint when only welcome node */}
          {nodes.length === 1 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/80 backdrop-blur rounded-2xl px-5 py-4 border border-slate-200 shadow-sm mt-24">
                <p className="text-xs text-slate-500 text-center max-w-[240px]">Canvas is ready — ask about any topic and watch the diagram build itself</p>
              </div>
            </div>
          )}

          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm">
            {nodes.length} nodes • {edges.length} edges
          </div>

          <ExplanationDrawer
            open={drawerOpen}
            speechText={drawerText || lastSpeech}
            onClose={() => setDrawerOpen(false)}
            onReplay={handleReplay}
            onPause={pauseSpeech}
            onResume={resumeSpeech}
            onStop={stopSpeech}
            isSpeaking={isSpeaking}
            isPaused={isPaused}
          />
        </div>
      </div>
    </div>
  );
}
