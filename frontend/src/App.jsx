import { useState, useCallback } from "react";
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
import { Send, Loader2, Volume2, Sparkles, BookOpen, Trash2, MousePointerClick, History } from "lucide-react";

const initialNodes = [
  {
    id: "start",
    position: { x: 250, y: 50 },
    data: { label: "Welcome to Dyna-learn!\nAsk a question or click a node to begin." },
    type: "input",
    style: {
      background: "#fff",
      border: "2px solid #aa3bff",
      borderRadius: "12px",
      padding: "12px",
      fontSize: "14px",
      width: 280,
      textAlign: "center",
    },
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
  const [error, setError] = useState("");

  // Lifecycle alignment: chatHistory (sliding window) + selected node
  const [chatHistory, setChatHistory] = useState([]); // {role: "user"|"model", text: string}[]
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Function: plays speech_text using browser SpeechSynthesis
  const speakText = useCallback((text) => {
    if (!text) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.lang = "en-US";

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setLastSpeech(text);
  }, []);

  // Helpers to style nodes/edges
  const formatNodes = (apiNodes) =>
    (apiNodes || []).map((n, idx) => {
      const isHighlighted = n.highlight === true;
      const isSelected = n.id === selectedNodeId;
      return {
        id: n.id || `node-${Date.now()}-${idx}`,
        position: n.position || { x: 100 + idx * 200, y: 150 + idx * 80 },
        data: { label: n.label || n.data?.label || "Concept" },
        type: n.type || "default",
        style: isHighlighted
          ? {
              background: "#fef2f2",
              border: "2px solid #ef4444",
              borderRadius: "10px",
              padding: "10px 14px",
              fontSize: "13px",
              minWidth: 140,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(239,68,68,0.25)",
              color: "#b91c1c",
            }
          : isSelected
          ? {
              background: "#f5f3ff",
              border: "2px solid #7c3aed",
              borderRadius: "10px",
              padding: "10px 14px",
              fontSize: "13px",
              minWidth: 140,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(124,58,237,0.2)",
            }
          : {
              background: "#ffffff",
              border: "2px solid #6366f1",
              borderRadius: "10px",
              padding: "10px 14px",
              fontSize: "13px",
              minWidth: 140,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            },
      };
    });

  const formatEdges = (apiEdges) =>
    (apiEdges || []).map((e, idx) => ({
      id: e.id || `edge-${Date.now()}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label || "",
      animated: true,
      style: { stroke: "#6366f1" },
    }));

  // Function: handles diagram_update from API with expanded actions
  const applyDiagramUpdate = useCallback(
    (diagramUpdate) => {
      if (!diagramUpdate) return;
      const { action, nodes: newNodes, edges: newEdges } = diagramUpdate;

      const formattedNodes = formatNodes(newNodes);
      const formattedEdges = formatEdges(newEdges);

      switch (action) {
        case "add_nodes":
          // React Flow add_nodes: append nodes, optionally edges if provided
          if (formattedNodes.length) setNodes((prev) => [...prev, ...formattedNodes]);
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          break;
        case "add_edges":
          // Only edges
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          // If nodes also provided with add_edges, append them too
          if (formattedNodes.length) setNodes((prev) => [...prev, ...formattedNodes]);
          break;
        case "update_nodes": {
          // Highlight or update existing nodes by id; add new if not found
          setNodes((prev) => {
            const map = new Map(prev.map((n) => [n.id, n]));
            formattedNodes.forEach((n) => {
              const existing = map.get(n.id);
              if (existing) {
                // merge, but preserve position if incoming has no position
                map.set(n.id, { ...existing, ...n, data: { ...existing.data, ...n.data }, style: n.style });
              } else {
                map.set(n.id, n);
              }
            });
            return Array.from(map.values());
          });
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          break;
        }
        case "clear_canvas":
          setNodes(initialNodes);
          setEdges(initialEdges);
          setSelectedNodeId(null);
          break;
        // legacy compatibility retained
        case "replace":
          setNodes(formattedNodes.length ? formattedNodes : initialNodes);
          setEdges(formattedEdges);
          break;
        case "create":
        case "append":
          if (formattedNodes.length) setNodes((prev) => [...prev, ...formattedNodes]);
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          break;
        case "update":
          setNodes((prev) => {
            const map = new Map(prev.map((n) => [n.id, n]));
            formattedNodes.forEach((n) => map.set(n.id, { ...map.get(n.id), ...n }));
            return Array.from(map.values());
          });
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          break;
        case "delete": {
          const idsToDelete = new Set(formattedNodes.map((n) => n.id));
          setNodes((prev) => prev.filter((n) => !idsToDelete.has(n.id)));
          setEdges((prev) => prev.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)));
          break;
        }
        case "none":
        default:
          if (formattedNodes.length) setNodes((prev) => [...prev, ...formattedNodes]);
          if (formattedEdges.length) setEdges((prev) => [...prev, ...formattedEdges]);
          break;
      }
    },
    [setNodes, setEdges, selectedNodeId]
  );

  // Fetch function: posts question to backend with full lifecycle payload
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setError("");

    const canvasState = { nodes, edges };
    const payload = {
      studentQuestion: question,
      canvasState,
      flowchartState: canvasState, // backwards compat alias
      chatHistory,
      selectedNodeId,
    };

    try {
      const res = await fetch("http://localhost:3000/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const { speech_text, diagram_update } = data;

      if (speech_text) {
        speakText(speech_text);
        // Maintain sliding window: append user + model, keep last 6
        setChatHistory((prev) => {
          const next = [...prev, { role: "user", text: question }, { role: "model", text: speech_text }];
          return next.slice(-6);
        });
      } else {
        // Even if no speech, keep user prompt in history
        setChatHistory((prev) => [...prev, { role: "user", text: question }].slice(-6));
      }

      if (diagram_update) {
        applyDiagramUpdate(diagram_update);
      }

      setQuestion("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to fetch tutor response");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    // Trigger clear_canvas via local state (and could also dispatch to backend if needed)
    setNodes(initialNodes);
    setEdges(initialEdges);
    setChatHistory([]);
    setSelectedNodeId(null);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setLastSpeech("");
    setError("");
  };

  const handleReplay = () => {
    if (lastSpeech) speakText(lastSpeech);
  };

  const selectedNodeLabel = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)?.data?.label || selectedNodeId
    : null;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-indigo-50 text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white">
            <BookOpen size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Dyna-learn</h1>
            <p className="text-xs text-slate-500">Interactive AI Tutor • Gemini 2.5 Flash • Monorepo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReplay}
            disabled={!lastSpeech}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm disabled:opacity-40 hover:bg-slate-50 transition"
            title="Replay last explanation"
          >
            <Volume2 size={16} className={isSpeaking ? "text-violet-600 animate-pulse" : ""} />
            {isSpeaking ? "Speaking..." : "Replay"}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 transition"
          >
            <Trash2 size={14} /> Clear Canvas
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left / Input Panel */}
        <div className="w-full sm:w-[380px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 shrink-0">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800">
              <Sparkles size={16} className="text-violet-600" /> Ask Dyna-learn
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Click a node + ask — tutor personalizes to your canvas & history.
            </p>
            {selectedNodeId && (
              <div className="mt-3 flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <MousePointerClick size={12} className="text-violet-600" />
                <span className="font-medium text-violet-700">Selected:</span>
                <span className="truncate">{selectedNodeLabel}</span>
                <button onClick={() => setSelectedNodeId(null)} className="ml-auto text-violet-600 hover:text-violet-800 underline">Clear</button>
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
              <History size={10} />
              History: {chatHistory.length}/6 (sliding window) • Canvas: {nodes.length} nodes
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 min-h-0">
            {/* Chat history */}
            {chatHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Conversation (last 6)</p>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                  {chatHistory.map((turn, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                        turn.role === "user"
                          ? "bg-slate-900 text-white ml-6"
                          : "bg-violet-50 border border-violet-200 text-slate-700 mr-2"
                      }`}
                    >
                      <span className="font-semibold text-[10px] uppercase opacity-60">
                        {turn.role === "user" ? "You" : "Tutor"}
                      </span>
                      <p className="mt-0.5 line-clamp-3">{turn.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={selectedNodeId ? `Ask about "${selectedNodeLabel}"...` : "e.g. Explain how Database connects to API..."}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:bg-white transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-medium text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Thinking...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Ask Tutor
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">
                {error}
              </div>
            )}

            {lastSpeech && (
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 mb-1">
                  <Volume2 size={12} /> Last Explanation
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white border border-violet-200">
                    {isSpeaking ? "Playing..." : "Ready"}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed line-clamp-6">{lastSpeech}</p>
                <button
                  type="button"
                  onClick={handleReplay}
                  className="mt-2 text-xs text-violet-600 hover:text-violet-800 underline"
                >
                  Replay with voice
                </button>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <p className="font-semibold mb-1.5">Lifecycle:</p>
              <ol className="list-decimal list-inside space-y-1 text-[10px] leading-relaxed">
                <li>Click node → selectedNodeId</li>
                <li>POST includes chatHistory(6) + canvasState + selectedNode</li>
                <li>Backend sliding window + prompt stitch</li>
                <li>Gemini returns speech_text + diagram_update</li>
                <li>Actions: add_nodes / add_edges / update_nodes / clear_canvas</li>
              </ol>
            </div>
          </div>

          <div className="p-4 text-[10px] text-slate-400 border-t border-slate-100 text-center shrink-0">
            Monorepo: github.com/The-Zoldycks/dyna-learn<br />
            Frontend: :5173 • Backend: :3000
          </div>
        </div>

        {/* Right / Canvas Panel */}
        <div className="flex-1 relative bg-slate-100">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="bg-slate-50"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}
            />
          </ReactFlow>

          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {nodes.length} nodes • {edges.length} edges • {selectedNodeId ? `Focused: ${selectedNodeLabel}` : "Click node to focus"}
          </div>
        </div>
      </div>
    </div>
  );
}
