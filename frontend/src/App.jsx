import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  Pause, Play, Square, ChevronDown, ChevronUp, Maximize2, X, Mic,
  MessageSquare, Network,
} from "lucide-react";
import { toast } from "sonner";
import CustomNode from "./components/CustomNode.jsx";
import ExplanationDrawer from "./components/ExplanationDrawer.jsx";
import ChatSkeleton from "./components/ChatSkeleton.jsx";
import SimpleMarkdown from "./components/SimpleMarkdown.jsx";
import { getLayoutedElements } from "./utils/layout.js";

const nodeTypes = { custom: CustomNode };

const INITIAL_NODE = {
  id: "start",
  position: { x: 250, y: 80 },
  data: { label: "Welcome to Dyna-learn!\nAsk a question or click a node to begin.", icon: "brain", shape: "pill" },
  type: "custom",
};

const initialNodes = [INITIAL_NODE];
const initialEdges = [];

// ---------- session-storage helpers ----------
const SESSION_NODES = "dyna-nodes";
const SESSION_EDGES = "dyna-edges";
const SESSION_CHAT  = "dyna-chat";

function sessionRead(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sessionWrite(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function sessionClear() {
  try {
    sessionStorage.removeItem(SESSION_NODES);
    sessionStorage.removeItem(SESSION_EDGES);
    sessionStorage.removeItem(SESSION_CHAT);
  } catch {}
}
// ------------------------------------------------

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export default function App() {
  // Restore canvas + chat from sessionStorage on first mount
  const [nodes, setNodes, onNodesChange] = useNodesState(sessionRead(SESSION_NODES, initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(sessionRead(SESSION_EDGES, initialEdges));
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [lastSpeech, setLastSpeech] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState("");
  const [chatHistory, setChatHistory] = useState(() => sessionRead(SESSION_CHAT, []));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerText, setDrawerText] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "canvas"
  const [browserVoices, setBrowserVoices] = useState([]);
  const [edgeVoices, setEdgeVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(
    () => localStorage.getItem("dyna-voice") || "en-US-AriaNeural"
  );

  const lastPayloadRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const reactFlowInstanceRef = useRef(null); // imperative fitView
  const chatBottomRef = useRef(null);         // auto-scroll sentinel

  // ---- React Flow callbacks ----
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: false }, eds)),
    [setEdges]
  );
  const onNodeClick = useCallback((_, node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  // ---- Session persistence ----
  useEffect(() => { sessionWrite(SESSION_NODES, nodes); }, [nodes]);
  useEffect(() => { sessionWrite(SESSION_EDGES, edges); }, [edges]);
  useEffect(() => { sessionWrite(SESSION_CHAT, chatHistory); }, [chatHistory]);

  // ---- Auto-scroll chat to latest message ----
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // ---- Voice lists + keyboard shortcut ----
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/voices`)
      .then((r) => r.json())
      .then((data) => { if (data.voices?.length) setEdgeVoices(data.voices); })
      .catch(() => {});

    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      if (voices.length) setBrowserVoices(voices);
    };
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Persist selected voice
  useEffect(() => { if (selectedVoice) localStorage.setItem("dyna-voice", selectedVoice); }, [selectedVoice]);

  // ---- Helpers ----
  const toggleExpand = (idx) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  }, []);

  useEffect(() => () => { cleanupAudio(); window.speechSynthesis?.cancel(); }, [cleanupAudio]);

  // ---- TTS: browser fallback ----
  const speakBrowser = useCallback((text) => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    cleanupAudio();
    const utterance = new SpeechSynthesisUtterance(text);
    const bv = browserVoices.find((v) => v.name === selectedVoice || v.voiceURI === selectedVoice);
    if (bv) utterance.voice = bv;
    utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1;
    utterance.lang = bv?.lang || "en-US";
    utterance.onstart  = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend    = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror  = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onpause  = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);
    window.speechSynthesis.speak(utterance);
  }, [browserVoices, selectedVoice, cleanupAudio]);

  // ---- TTS: Edge Neural ----
  const speakEdge = useCallback(async (text) => {
    try {
      cleanupAudio();
      window.speechSynthesis?.cancel();
      setIsTTSLoading(true); setIsSpeaking(false); setIsPaused(false);

      const res = await fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 5000), voice: selectedVoice }),
      });
      if (!res.ok) throw new Error(`Edge TTS ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay   = () => { setIsTTSLoading(false); setIsSpeaking(true); setIsPaused(false); };
      audio.onpause  = () => { if (!audio.ended) setIsPaused(true); };
      audio.onended  = () => { setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false); cleanupAudio(); };
      audio.onerror  = () => { setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false); cleanupAudio(); };

      await audio.play();
      return true;
    } catch (e) {
      cleanupAudio();
      setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false);
      console.warn("Edge TTS failed, falling back:", e.message);
      return false;
    }
  }, [selectedVoice, cleanupAudio]);

  // ---- Stable isEdgeVoice ----
  const isEdgeVoice = useCallback(
    (voice) => voice.includes("Neural") || edgeVoices.some((v) => v.id === voice),
    [edgeVoices]
  );

  // ---- Unified speak ----
  const speakText = useCallback(async (text) => {
    if (!text) return;
    setLastSpeech(text); setDrawerText(text);
    if (isEdgeVoice(selectedVoice)) {
      const ok = await speakEdge(text);
      if (ok) return;
      toast.info("Falling back to browser voice", {
        duration: 2500,
        description: "Edge neural unavailable — using offline voice.",
      });
    }
    speakBrowser(text);
  }, [selectedVoice, isEdgeVoice, speakEdge, speakBrowser]);

  const pauseSpeech = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) { audioRef.current.pause(); setIsPaused(true); return; }
    if (window.speechSynthesis?.speaking && !isPaused) { window.speechSynthesis.pause(); setIsPaused(true); }
  }, [isPaused]);

  const resumeSpeech = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play().then(() => setIsPaused(false)).catch(() => setIsPaused(false));
      return;
    }
    if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); }
  }, [isPaused]);

  const stopSpeech = useCallback(() => {
    cleanupAudio();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false);
  }, [cleanupAudio]);

  // ---- Imperative fitView via React Flow instance ----
  const triggerFitView = useCallback((nodeIds = null) => {
    if (!reactFlowInstanceRef.current) return;
    const opts = { duration: 500, padding: 0.25 };
    if (nodeIds?.length) opts.nodes = nodeIds.map((id) => ({ id }));
    reactFlowInstanceRef.current.fitView(opts);
  }, []);

  // ---- Node/edge formatting ----
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

  const formatNodes = useCallback((apiNodes) =>
    (apiNodes || []).map((n, idx) => ({
      id: n.id || `node-${Date.now()}-${idx}`,
      position: n.position || { x: 0, y: 0 },
      data: {
        label: n.label || n.data?.label || "Concept",
        icon: n.icon || inferIcon(n.label || n.data?.label || ""),
        shape: n.shape || "rectangle",
        highlight: n.highlight === true,
      },
      type: "custom",
    })),
  []);

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
    })),
  []);

  const applyLayoutAndSet = useCallback((nextNodes, nextEdges) => {
    const nodeIds = new Set(nextNodes.map((n) => n.id));
    const validEdges = nextEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    if (nextNodes.length <= 1) { setNodes(nextNodes); setEdges(validEdges); return; }
    const { nodes: ln, edges: le } = getLayoutedElements(nextNodes, validEdges, "TB");
    setNodes(ln); setEdges(le);
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
          setEdges((prevEdges) => {
            const edgeIds = new Set(prevEdges.map((e) => e.id));
            const newValid = formattedEdges.filter((e) => !edgeIds.has(e.id));
            const combinedEdges = [...prevEdges, ...newValid];
            const { nodes: ln, edges: le } = getLayoutedElements(merged, combinedEdges, "TB");
            setTimeout(() => {
              setNodes(ln); setEdges(le);
              setTimeout(() => triggerFitView(), 60);
            }, 0);
            return prevEdges;
          });
          return prev;
        });
        break;
      }
      case "add_edges": {
        setEdges((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          return [...prev, ...formattedEdges.filter((e) => !ids.has(e.id))];
        });
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
            if (existing) map.set(n.id, { ...existing, data: { ...existing.data, ...n.data } });
            else map.set(n.id, n);
          });
          return Array.from(map.values());
        });
        if (formattedEdges.length) {
          setEdges((prev) => {
            const ids = new Set(prev.map((e) => e.id));
            return [...prev, ...formattedEdges.filter((e) => !ids.has(e.id))];
          });
        }
        // Auto-fitView to highlighted nodes so they're always visible
        const highlightedIds = formattedNodes.filter((n) => n.data?.highlight).map((n) => n.id);
        if (highlightedIds.length) setTimeout(() => triggerFitView(highlightedIds), 150);
        break;
      }
      case "clear_canvas":
        setNodes(initialNodes); setEdges(initialEdges); setSelectedNodeId(null);
        break;
      case "replace":
        if (formattedNodes.length) applyLayoutAndSet(formattedNodes, formattedEdges);
        else applyLayoutAndSet(initialNodes, []);
        break;
      case "create":
      case "append": {
        setNodes((prev) => {
          const ids = new Set(prev.map((n) => n.id));
          const toAdd = formattedNodes.filter((n) => !ids.has(n.id));
          const merged = [...prev, ...toAdd];
          setEdges((prevE) => {
            const eIds = new Set(prevE.map((e) => e.id));
            const eAdd = formattedEdges.filter((e) => !eIds.has(e.id));
            const combined = [...prevE, ...eAdd];
            const { nodes: ln, edges: le } = getLayoutedElements(merged, combined, "TB");
            setTimeout(() => {
              setNodes(ln); setEdges(le);
              setTimeout(() => triggerFitView(), 60);
            }, 0);
            return prevE;
          });
          return prev;
        });
        break;
      }
      case "none":
      default:
        if (formattedNodes.length || formattedEdges.length) {
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
              setTimeout(() => {
                setNodes(ln); setEdges(le);
                setTimeout(() => triggerFitView(), 60);
              }, 0);
              return prevE;
            });
            return prev;
          });
        }
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatNodes, formatEdges, applyLayoutAndSet, edges, triggerFitView]);

  const applyDiagramUpdateStable = useCallback((update) => {
    if (
      !update ||
      update.action === "update_nodes" ||
      update.action === "clear_canvas" ||
      update.action === "none"
    ) {
      return applyDiagramUpdate(update);
    }
    if (update.action === "add_nodes") {
      const fN = formatNodes(update.nodes);
      const fE = formatEdges(update.edges);
      setNodes((prevNodes) => {
        const ids = new Set(prevNodes.map((n) => n.id));
        const toAdd = fN.filter((n) => !ids.has(n.id));
        const mergedNodes = [...prevNodes, ...toAdd];
        setEdges((prevEdges) => {
          const eIds = new Set(prevEdges.map((e) => e.id));
          const toAddE = fE.filter(
            (e) =>
              !eIds.has(e.id) &&
              mergedNodes.some((n) => n.id === e.source) &&
              mergedNodes.some((n) => n.id === e.target)
          );
          const mergedEdges = [...prevEdges, ...toAddE];
          const laid = getLayoutedElements(mergedNodes, mergedEdges, "TB");
          setTimeout(() => {
            setNodes(laid.nodes); setEdges(laid.edges);
            setTimeout(() => triggerFitView(), 60);
          }, 0);
          return prevEdges;
        });
        return prevNodes;
      });
      return;
    }
    return applyDiagramUpdate(update);
  }, [applyDiagramUpdate, formatNodes, formatEdges, setNodes, setEdges, triggerFitView]);

  // ---- Main tutor call ----
  const executeTutor = useCallback(async (payload, retryLabel) => {
    setLoading(true); setError(""); lastPayloadRef.current = payload;
    try {
      const res = await fetch(`${API_BASE}/api/tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const code = errData.code || "";
        let msg = errData.error || errData.details || `HTTP ${res.status}`;
        if (code === "GEMINI_RATE_LIMIT") msg = "Gemini free-tier rate limit hit — wait ~20s and retry.";
        if (code === "GEMINI_UNAVAILABLE") msg = "Gemini is under high demand — please retry.";
        throw Object.assign(new Error(msg), { code, payload });
      }

      const data = await res.json();
      const { speech_text, diagram_update } = data; // FIX #1: was `diagramUpdate` (undefined)

      if (speech_text) {
        speakText(speech_text);
        setDrawerText(speech_text); setDrawerOpen(true);
        setChatHistory((prev) => {
          const next = [...prev, { role: "user", text: payload.studentQuestion }, { role: "model", text: speech_text }];
          return next.slice(-6);
        });
      } else {
        setChatHistory((prev) => [...prev, { role: "user", text: payload.studentQuestion }].slice(-6));
      }

      if (diagram_update) applyDiagramUpdateStable(diagram_update); // FIX #1 applied
      if (retryLabel) toast.dismiss();
      return true;
    } catch (err) {
      console.error(err);
      const code = err.code || "";
      const isRateLimit =
        code === "GEMINI_RATE_LIMIT" ||
        err.message.includes("429") ||
        err.message.includes("rate limit");
      const description = isRateLimit
        ? "Gemini free-tier limit hit — wait ~20s before retrying."
        : err.message || "Failed to fetch tutor response";
      setError(err.message || "Failed to fetch tutor response");
      toast.error(isRateLimit ? "Rate limit hit" : "Tutor unavailable", {
        description,
        duration: Infinity,
        action: {
          label: "Retry",
          onClick: () => {
            const retryPayload = err.payload || lastPayloadRef.current || payload;
            executeTutor(retryPayload, true);
          },
        },
        cancel: { label: "Dismiss", onClick: () => toast.dismiss() },
      });
      return false;
    } finally { setLoading(false); }
  }, [speakText, applyDiagramUpdateStable]);

  // ---- Form submit ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || loading) return;
    const canvasState = { nodes, edges };
    const payload = {
      studentQuestion: question,
      canvasState,
      flowchartState: canvasState, // legacy compat
      chatHistory,
      selectedNodeId,
    };
    const ok = await executeTutor(payload);
    if (ok) setQuestion("");
  };

  const handleClear = () => {
    setNodes(initialNodes); setEdges(initialEdges); setChatHistory([]); setSelectedNodeId(null);
    stopSpeech(); setLastSpeech(""); setDrawerText(""); setDrawerOpen(false);
    setError(""); setExpandedIds(new Set()); lastPayloadRef.current = null;
    sessionClear(); // also wipe sessionStorage
    toast.success("Canvas cleared", { duration: 3000, description: "Welcome node restored — ask a new question" });
  };

  const handleReplay = () => { if (lastSpeech) speakText(lastSpeech); };

  // ---- Derived state ----
  const selectedNodeLabel = useMemo(
    () => selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.data?.label || selectedNodeId : null,
    [selectedNodeId, nodes]
  );
  const hasHighlightedNodes = useMemo(() => nodes.some((n) => n.data?.highlight), [nodes]);
  const isCanvasLarge = nodes.length > 25;

  // ---- JSX ----
  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-indigo-50 text-slate-900">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/dyna-learn-logo-blue.png"
            alt="Dyna-learn logo"
            className="h-16 object-contain contrast-125 saturate-150 brightness-[0.97] drop-shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
            style={{ filter: "contrast(1.55) saturate(1.3) brightness(0.96)" }}
          />
          <div className="hidden sm:block border-l border-slate-200 pl-3 ml-1">
            <h1 className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase leading-none">Interactive AI Tutor</h1>
            <p className="text-[11px] text-slate-400">Learn by asking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={drawerText ? () => setDrawerOpen((v) => !v) : handleReplay}
            disabled={!drawerText && !lastSpeech}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium disabled:opacity-40 hover:bg-slate-50 transition"
          >
            {drawerOpen ? <X size={14} /> : <Maximize2 size={14} />}
            {drawerOpen ? "Close" : "View"} Explanation
          </button>
          <div className="hidden sm:flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-white">
            <button onClick={handleReplay} disabled={!lastSpeech || isSpeaking || isTTSLoading} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title="Replay"><Volume2 size={14} /></button>
            <button onClick={isPaused ? resumeSpeech : pauseSpeech} disabled={!isSpeaking && !isPaused} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title={isPaused ? "Resume" : "Pause"}>{isPaused ? <Play size={14} /> : <Pause size={14} />}</button>
            <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused && !isTTSLoading} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40" title="Stop"><Square size={14} /></button>
          </div>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </header>

      {/* ── Main body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: Chat ── */}
        <div className={`${mobileTab === "chat" ? "flex" : "hidden"} sm:flex flex-col w-full sm:w-[380px] shrink-0 bg-white border-r border-slate-200 overflow-hidden`}>
          {/* Panel header */}
          <div className="p-4 border-b border-slate-100 shrink-0">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
              <Sparkles size={14} className="text-violet-600" /> Ask Dyna-learn
            </h2>
            <p className="text-xs text-slate-500 mt-1">Click a node + ask — tutor adapts to canvas &amp; history.</p>

            {/* Selected node badge */}
            {selectedNodeId && (
              <div className="mt-3 flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <MousePointerClick size={12} className="text-violet-600" />
                <span className="font-medium text-violet-700">Selected:</span>
                <span className="truncate flex-1">{selectedNodeLabel}</span>
                <button onClick={() => setSelectedNodeId(null)} className="text-violet-600 hover:text-violet-800 underline ml-2">Clear</button>
              </div>
            )}

            {/* Large-canvas warning */}
            {isCanvasLarge && (
              <div className="mt-2 flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-700">⚠️ Large canvas ({nodes.length} nodes) — consider clearing for best AI results.</span>
              </div>
            )}

            {/* Voice selector */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                <Mic size={12} className="text-violet-600" /> Voice
                <span className="ml-auto text-[10px] text-slate-500">{edgeVoices.length + browserVoices.length} voices</span>
              </div>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <optgroup label="Neural — Edge (online)">
                  {edgeVoices.length
                    ? edgeVoices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)
                    : <option value="en-US-AriaNeural">Aria — Warm female (US) — loading…</option>}
                </optgroup>
                <optgroup label="Offline / Standard">
                  {browserVoices.length
                    ? browserVoices.map((v) => <option key={v.name + v.voiceURI} value={v.name}>{v.name} — {v.lang}</option>)
                    : <option value="">Default system voice</option>}
                </optgroup>
              </select>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Top: neural Edge (no cold start). Bottom: offline device voices.</p>
            </div>
          </div>

          {/* Scrollable conversation + form */}
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
                        className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed border ${
                          turn.role === "user"
                            ? "bg-slate-900 text-white border-slate-800 ml-4"
                            : "bg-violet-50 border-violet-200 text-slate-700 mr-2"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[10px] uppercase opacity-60">
                            {turn.role === "user" ? "You" : "Tutor"}
                          </span>
                          {isLong && (
                            <button
                              onClick={() => toggleExpand(idx)}
                              className="text-[10px] underline opacity-70 hover:opacity-100 flex items-center gap-1"
                            >
                              {isExpanded ? <>Less <ChevronUp size={10} /></> : <>More <ChevronDown size={10} /></>}
                            </button>
                          )}
                        </div>
                        {/* Render tutor responses with markdown, user messages as plain text */}
                        {turn.role === "model" ? (
                          <SimpleMarkdown text={displayText} className="mt-1 text-[13px] leading-relaxed" />
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap break-words">{displayText}</p>
                        )}
                        {turn.role === "model" && (
                          <button
                            onClick={() => { setDrawerText(turn.text); setDrawerOpen(true); }}
                            className="mt-2 text-[11px] font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1"
                          >
                            <Maximize2 size={10} /> Open in drawer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {loading && <ChatSkeleton />}

            {/* Auto-scroll sentinel */}
            <div ref={chatBottomRef} />

            {/* Question form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sticky bottom-0 bg-white pt-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl+Enter (or Cmd+Enter on Mac) submits
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !loading && question.trim()) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={
                  selectedNodeId
                    ? `Ask about "${selectedNodeLabel}"… (Ctrl+Enter to send)`
                    : "e.g. Explain database normalization… (Ctrl+Enter to send)"
                }
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
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Thinking…</>
                  : <><Send size={16} /> Ask Tutor</>}
              </button>
              {loading && (
                <p className="text-xs text-center text-violet-600">
                  Input locked while thinking — prevents duplicate canvas updates
                </p>
              )}
            </form>

            {/* Error banner */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-3">
                <p className="font-semibold">Tutor error</p>
                <p className="mt-1 break-words">{error}</p>
                <button onClick={() => setError("")} className="mt-2 text-xs underline">Dismiss</button>
              </div>
            )}

            {/* Last-speech mini-player */}
            {lastSpeech && !drawerOpen && (
              <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
                  {isTTSLoading
                    ? <Loader2 size={12} className="text-violet-600 animate-spin" />
                    : <Volume2 size={12} className={isSpeaking ? "text-violet-600 animate-pulse" : ""} />}
                  Last Explanation
                  <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${
                    isTTSLoading
                      ? "bg-violet-100 text-violet-700 border-violet-200"
                      : isSpeaking
                      ? "bg-violet-600 text-white border-violet-600"
                      : isPaused
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : "bg-white border-slate-200"
                  }`}>
                    {isTTSLoading ? "Loading audio…" : isPaused ? "Paused" : isSpeaking ? "Playing" : "Ready"}
                  </span>
                </div>
                <div className="flex gap-1 mb-2">
                  <button onClick={handleReplay} disabled={isSpeaking || isTTSLoading} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-xs disabled:opacity-40">Replay</button>
                  <button onClick={isPaused ? resumeSpeech : pauseSpeech} disabled={!isSpeaking && !isPaused} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">{isPaused ? "Resume" : "Pause"}</button>
                  <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused && !isTTSLoading} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">Stop</button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-h-28 overflow-y-auto pr-1 whitespace-pre-wrap break-words">
                  {lastSpeech.slice(0, 420)}{lastSpeech.length > 420 ? "…" : ""}
                </p>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="mt-2 w-full py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium hover:bg-slate-100 flex items-center justify-center gap-1"
                >
                  <Maximize2 size={12} /> View full in drawer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Canvas ── */}
        <div className={`${mobileTab === "canvas" ? "flex" : "hidden"} sm:flex flex-1 relative bg-slate-50 overflow-hidden`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            elementsSelectable
            className="bg-slate-50"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep", animated: false }}
          >
            <Background gap={20} size={1} color="#e2e8f0" />
            <Controls />
            <MiniMap pannable zoomable style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }} />
          </ReactFlow>

          {/* Canvas empty-state hint */}
          {nodes.length === 1 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/80 backdrop-blur rounded-2xl px-5 py-4 border border-slate-200 shadow-sm mt-24">
                <p className="text-xs text-slate-500 text-center max-w-[240px]">
                  Canvas is ready — ask about any topic and watch the diagram build itself
                </p>
              </div>
            </div>
          )}

          {/* Node / edge counter — always visible when diagram has content */}
          {nodes.length > 1 && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-600 shadow-sm flex items-center gap-2 pointer-events-none">
              {loading && <Loader2 size={12} className="animate-spin text-violet-600 shrink-0" />}
              <span>{nodes.length} nodes · {edges.length} edges</span>
            </div>
          )}

          {/* Highlight legend — appears whenever any node is highlighted */}
          {hasHighlightedNodes && (
            <div className="absolute bottom-16 left-3 flex items-center gap-2 bg-white/95 backdrop-blur border border-red-200 rounded-full px-3 py-1.5 text-xs text-red-700 shadow-sm pointer-events-none">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              Highlighted — confusion detected on this concept
            </div>
          )}

          {/* Explanation drawer (overlays canvas) */}
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
            isTTSLoading={isTTSLoading}
          />
        </div>
      </div>

      {/* ── Mobile tab switcher (hidden on sm+) ── */}
      <div className="sm:hidden flex border-t border-slate-200 bg-white shrink-0">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-medium transition ${
            mobileTab === "chat"
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px"
              : "text-slate-500 hover:text-slate-700"
          }`}
          aria-label="Chat panel"
        >
          <MessageSquare size={18} className="mb-0.5" />
          Chat
        </button>
        <button
          onClick={() => setMobileTab("canvas")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-medium transition ${
            mobileTab === "canvas"
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px"
              : "text-slate-500 hover:text-slate-700"
          }`}
          aria-label="Canvas panel"
        >
          <Network size={18} className="mb-0.5" />
          Canvas
        </button>
      </div>
    </div>
  );
}
