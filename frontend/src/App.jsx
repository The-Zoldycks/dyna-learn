import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Send, Loader2, Volume2, Sparkles, Trash2, MousePointerClick,
  ChevronUp, Mic,
  MessageSquare, Network, Download, Save, BookOpen, Image, XCircle, Brain,
} from "lucide-react";
import { toast } from "sonner";
import CustomNode from "./components/CustomNode.jsx";

import ChatSkeleton from "./components/ChatSkeleton.jsx";
import SimpleMarkdown from "./components/SimpleMarkdown.jsx";
import QuizCard from "./components/QuizCard.jsx";
const JournalModal = lazy(() => import("./components/JournalModal.jsx"));
import { getLayoutedElements } from "./utils/layout.js";
import { updateStreakOnLoad, saveSnapshot, logHighlightToSRS, updateSRSItem } from "./utils/storage.js";
import { track } from "./utils/analytics.js";

const nodeTypes = { custom: CustomNode };

const INITIAL_NODE = {
  id: "start",
  position: { x: 250, y: 80 },
  data: { label: "Welcome to Dyna-learn!\nAsk a question or click a node to begin.", icon: "brain", shape: "pill" },
  type: "custom",
};

const initialNodes = [INITIAL_NODE];
const initialEdges = [];

// ---------- cross-session persistence helpers (localStorage, quota-safe) ----------
// Migrates legacy sessionStorage keys forward so returning users keep their lesson.
const SESSION_NODES = "dyna-nodes";
const SESSION_EDGES = "dyna-edges";
const SESSION_CHAT  = "dyna-chat";

function sessionRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Basic shape validation — silently recover from corrupt payloads
    if (!Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    // Corrupted JSON — nuke the key and recover
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {}
    return fallback;
  }
}

function sessionWrite(key, value) {
  const write = (store) => store.setItem(key, JSON.stringify(value));
  try {
    write(localStorage);
  } catch {
    // Quota exceeded — retry with a trimmed payload, then give up silently
    try {
      const trimmed = Array.isArray(value) ? value.slice(-6) : value;
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {
      try {
        const minimal = Array.isArray(value) ? value.slice(-2) : value;
        localStorage.setItem(key, JSON.stringify(minimal));
      } catch {}
    }
  }
}

function sessionClear() {
  try {
    localStorage.removeItem(SESSION_NODES);
    localStorage.removeItem(SESSION_EDGES);
    localStorage.removeItem(SESSION_CHAT);
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

  const [chatHistory, setChatHistory] = useState(() => sessionRead(SESSION_CHAT, []));
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "canvas"
  const [browserVoices, setBrowserVoices] = useState([]);
  const [edgeVoices, setEdgeVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(
    () => localStorage.getItem("dyna-voice") || "en-US-AriaNeural"
  );
  const [isListening, setIsListening] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  const lastPayloadRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const reactFlowInstanceRef = useRef(null); // imperative fitView
  const chatBottomRef = useRef(null);         // auto-scroll sentinel

  useEffect(() => {
    updateStreakOnLoad();
  }, []);

  // ---- Share URL parsing on mount ----
  useEffect(() => {
    if (window.location.hash.startsWith("#s=")) {
      try {
        const payload = window.location.hash.slice(3);
        const jsonStr = decodeURIComponent(escape(window.atob(payload)));
        const data = JSON.parse(jsonStr);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        // Strip hash cleanly without refreshing
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        toast.success("Shared canvas loaded!", { duration: 3000 });
      } catch (err) {
        toast.error("Failed to load shared canvas", { description: "Link might be corrupted or too long." });
        console.error("Share decode error:", err);
      }
    }
  }, [setNodes, setEdges]);

  // ---- React Flow callbacks ----
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: false }, eds)),
    [setEdges]
  );
  const onNodeClick = useCallback((_, node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  // ---- Session persistence (debounced — avoids a write per drag tick) ----
  useEffect(() => {
    const t = setTimeout(() => sessionWrite(SESSION_NODES, nodes), 300);
    return () => clearTimeout(t);
  }, [nodes]);
  useEffect(() => {
    const t = setTimeout(() => sessionWrite(SESSION_EDGES, edges), 300);
    return () => clearTimeout(t);
  }, [edges]);
  useEffect(() => {
    const t = setTimeout(() => {
      // Strip image dataUrls before persisting — one 5MB upload would blow the sessionStorage quota
      const lean = chatHistory.map((turn) => {
        if (!turn.image) return turn;
        const { image, ...rest } = turn;
        return rest;
      });
      sessionWrite(SESSION_CHAT, lean);
    }, 300);
    return () => clearTimeout(t);
  }, [chatHistory]);

  // ---- Auto-scroll chat to latest message (instantly if reduced motion) ----
  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chatBottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [chatHistory]);

  // ---- Custom Node Toolbar 'Ask AI' listener ----
  useEffect(() => {
    const handleAskNode = (e) => {
      setQuestion(`Explain ${e.detail} in more detail.`);
      setMobileTab("chat"); // ensure we switch to chat on mobile
      setTimeout(() => {
        const textarea = document.querySelector('textarea');
        if (textarea) textarea.focus();
      }, 50);
    };
    window.addEventListener('ask-node', handleAskNode);
    return () => window.removeEventListener('ask-node', handleAskNode);
  }, []);

  // ---- Connectivity detection (Rule 13 — Connectivity States) ----
  useEffect(() => {
    const goOffline = () => {
      setIsOffline(true);
      toast.warning("You're offline", {
        description: "Check your connection. The tutor won't respond until you reconnect.",
        duration: Infinity,
        id: "offline-toast",
      });
    };
    const goOnline = () => {
      setIsOffline(false);
      toast.dismiss("offline-toast");
      toast.success("Back online!", { description: "You're reconnected. Good to go.", duration: 3000 });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

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
    setLastSpeech(text);
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
      animated: true,
      pathOptions: { borderRadius: 12 },
      style: { stroke: "#8b5cf6", strokeWidth: 2, strokeDasharray: "5, 5" },
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
          // Point 6: Remove the welcome node when real explanations populate the canvas
          const isOnlyStart = prev.length === 1 && prev[0].id === "start";
          const baseNodes = isOnlyStart ? [] : prev;
          
          const existingIds = new Set(baseNodes.map((n) => n.id));
          const toAdd = formattedNodes.filter((n) => !existingIds.has(n.id));
          const merged = [...baseNodes, ...toAdd];
          
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
            if (existing) {
              const updatedData = { ...existing.data, ...n.data };
              map.set(n.id, { ...existing, data: updatedData });
              
              // Log confusion to SRS
              if (n.data?.highlight && updatedData.label) {
                logHighlightToSRS(n.id, updatedData.label);
              }
            }
            else {
              map.set(n.id, n);
              if (n.data?.highlight && n.data?.label) {
                logHighlightToSRS(n.id, n.data.label);
              }
            }
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
          const isOnlyStart = prev.length === 1 && prev[0].id === "start";
          const baseNodes = isOnlyStart ? [] : prev;
          
          const ids = new Set(baseNodes.map((n) => n.id));
          const toAdd = formattedNodes.filter((n) => !ids.has(n.id));
          const merged = [...baseNodes, ...toAdd];
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
    setLoading(true); lastPayloadRef.current = payload;
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
      const { speech_text, diagram_update, quiz } = data;

      if (speech_text || quiz) {
        if (speech_text) {
          speakText(speech_text);
        }
        setChatHistory((prev) => {
          const next = [
            ...prev,
            { role: "user", text: payload.studentQuestion, image: payload.image?.dataUrl || null },
            { role: "model", text: speech_text || "", quiz: quiz || null }
          ];
          return next.slice(-6);
        });
      } else {
        setChatHistory((prev) => [...prev, { role: "user", text: payload.studentQuestion, image: payload.image?.dataUrl || null }].slice(-6));
      }

      if (diagram_update && diagram_update.action !== "quiz") {
        applyDiagramUpdateStable(diagram_update);
      }
      if (retryLabel) toast.dismiss();
      track("question_asked", { hasImage: !!payload.image, nodeSelected: !!payload.selectedNodeId });
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
    if (!question.trim() && !selectedImage || loading) return;
    if (isOffline) {
      toast.error("You're offline", { description: "Reconnect to the internet before asking the tutor." });
      return;
    }
    const canvasState = { nodes, edges };
    
    // Strip image dataUrl from previous turns to save tokens and payload size
    const cleanHistory = chatHistory.map(turn => {
      if (!turn.image) return turn;
      const { image, ...rest } = turn;
      return rest;
    });

    const payload = {
      studentQuestion: question.trim() || "What's in this image?",
      canvasState,
      flowchartState: canvasState, // legacy compat
      chatHistory: cleanHistory,
      selectedNodeId,
      image: selectedImage ? { base64: selectedImage.base64, mimeType: selectedImage.mimeType, dataUrl: selectedImage.dataUrl } : null,
    };
    const ok = await executeTutor(payload);
    if (ok) {
      setQuestion("");
      setSelectedImage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setNodes(initialNodes); setEdges(initialEdges); setChatHistory([]); setSelectedNodeId(null);
    stopSpeech(); setLastSpeech("");
    setExpandedIds(new Set()); lastPayloadRef.current = null;
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    sessionClear(); // also wipe sessionStorage
    toast.success("Canvas cleared", { duration: 3000, description: "Welcome node restored — ask a new question" });
  };

  const handleReplay = () => { if (lastSpeech) speakText(lastSpeech); };

  // Rasterize an SVG string to a PNG blob (2x for crisp text). SVG uses only
  // system fonts — no external refs, so the canvas is never tainted.
  const svgToPngBlob = (svg, W, H, scale = 2) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(W * scale);
        canvas.height = Math.round(H * scale);
        const ctx = canvas.getContext("2d");
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
      reject(new Error("SVG raster failed"));
    };
    img.src = url;
  });

  const renderDiagramPng = useCallback(async () => {
    const instance = reactFlowInstanceRef.current;
    if (!instance) return null;
    const svg = buildDiagramSVG(instance.getNodes(), instance.getEdges());
    if (!svg) return null;
    return svgToPngBlob(svg.text, svg.W, svg.H);
  }, []);

  // Pure SVG builder shared by PNG export + image share (null when empty)
  const buildDiagramSVG = (exportNodes, exportEdges) => {
    if (!exportNodes.length) return null;

      // ── Compute bounding box ──────────────────────────────────────────────
      const PAD = 48;
      const xs = exportNodes.map((n) => n.position.x);
      const ys = exportNodes.map((n) => n.position.y);
      const ws = exportNodes.map((n) => n.measured?.width  || 172);
      const hs = exportNodes.map((n) => n.measured?.height || 64);
      const minX = Math.min(...xs) - PAD;
      const minY = Math.min(...ys) - PAD;
      const maxX = Math.max(...xs.map((x, i) => x + ws[i])) + PAD;
      const maxY = Math.max(...ys.map((y, i) => y + hs[i])) + PAD;
      const W = maxX - minX;
      const H = maxY - minY;

      // ── Color helpers ─────────────────────────────────────────────────────
      const nodeColor = (n) =>
        n.data?.highlight ? { fill: "#fef2f2", stroke: "#ef4444", text: "#b91c1c" }
        : { fill: "#ffffff", stroke: "#818cf8", text: "#1e293b" };

      // ── Edge SVG ──────────────────────────────────────────────────────────
      const edgeSvg = exportEdges.map((e) => {
        const src = exportNodes.find((n) => n.id === e.source);
        const tgt = exportNodes.find((n) => n.id === e.target);
        if (!src || !tgt) return "";
        const sw = src.measured?.width  || 172;
        const sh = src.measured?.height || 64;
        const tw = tgt.measured?.width  || 172;
        const th = tgt.measured?.height || 64;
        // Bottom-centre of source → top-centre of target
        const x1 = (src.position.x + sw / 2) - minX;
        const y1 = (src.position.y + sh)      - minY;
        const x2 = (tgt.position.x + tw / 2)  - minX;
        const y2 = (tgt.position.y)            - minY;
        const cy = (y1 + y2) / 2;
        const path = `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
        const label = e.label
          ? `<text x="${(x1 + x2) / 2}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="#64748b" font-family="system-ui,sans-serif">${e.label}</text>`
          : "";
        return `<path d="${path}" fill="none" stroke="#818cf8" stroke-width="2"/>${label}`;
      }).join("\n");

      // ── Node SVG ──────────────────────────────────────────────────────────
      const nodeSvg = exportNodes.map((n) => {
        const nw = n.measured?.width  || 172;
        const nh = n.measured?.height || 64;
        const x  = n.position.x - minX;
        const y  = n.position.y - minY;
        const cx = x + nw / 2;
        const cy = y + nh / 2;
        const c  = nodeColor(n);
        const label = (n.data?.label || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

        // Multi-line label
        const lineH  = 14;
        const startY = cy - ((lines.length - 1) * lineH) / 2;
        const textEl = lines.map((ln, i) =>
          `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="${c.text}" font-family="system-ui,sans-serif">${ln}</text>`
        ).join("\n");

        // Highlight pulse indicator dot
        const dot = c.stroke === "#ef4444"
          ? `<circle cx="${x + nw - 5}" cy="${y + 5}" r="4" fill="#ef4444"/>`
          : "";

        return `${shapeEl}\n${textEl}\n${dot}`;
      }).join("\n");

      // ── Compose full SVG ──────────────────────────────────────────────────
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <!-- Edges -->
  ${edgeSvg}
  <!-- Nodes -->
  ${nodeSvg}
  <!-- Footer -->
  <text x="${W - 12}" y="${H - 10}" text-anchor="end" font-size="10" fill="#94a3b8" font-family="system-ui,sans-serif">Dyna-learn · ${new Date().toLocaleDateString()}</text>
</svg>`;

    return { text: svg, W, H };
  };

  const handleExportPNG = useCallback(async () => {
    const instance = reactFlowInstanceRef.current;
    if (!instance) return;
    try {
      toast.loading("Generating PNG…", { id: "export" });
      const built = buildDiagramSVG(instance.getNodes(), instance.getEdges());
      if (!built) return;
      const blob = await svgToPngBlob(built.text, built.W, built.H);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `dyna-learn-${Date.now()}.png`;
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
      track("diagram_exported", { format: "png" });
      toast.success("Diagram exported as PNG!", { id: "export", duration: 2500 });
    } catch (err) {
      console.error("Export failed:", err);
      toast.dismiss("export");
      toast.error("Export failed — try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Voice Input -----------------------------------------------------
  const handleVoiceStart = useCallback((e) => {
    e.preventDefault();
    if (loading) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(transcript);
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    recognition.start();
  }, [loading]);

  const handleVoiceStop = useCallback((e) => {
    e.preventDefault();
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB for the Gemini API.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      setSelectedImage({
        dataUrl: result,
        base64: base64,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleShare = useCallback(async () => {
    if (nodes.length <= 1) return;
    try {
      const payload = {
        nodes: nodes.map(n => ({ id: n.id, data: n.data, position: n.position, type: n.type })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label }))
      };
      // Minimal zero-dependency base64 string for URL hash
      const jsonStr = JSON.stringify(payload);
      const b64 = window.btoa(unescape(encodeURIComponent(jsonStr)));

      const url = `${window.location.origin}${window.location.pathname}#s=${b64}`;
      if (url.length > 4000) {
        throw new Error("Canvas is too large to share via URL link. Try taking a snapshot instead.");
      }

      // Prefer native share with a PNG snapshot where supported
      try {
        const blob = await renderDiagramPng();
        const file = blob ? new File([blob], `dyna-learn-${Date.now()}.png`, { type: "image/png" }) : null;
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Dyna-learn lesson", text: url });
          track("lesson_shared", { method: "file" });
          toast.success("Lesson shared!");
          return;
        }
      } catch (shareErr) {
        // User dismissed the sheet or file share failed — fall through to link
        if (shareErr?.name === "AbortError") return;
      }

      await navigator.clipboard.writeText(url);
      track("lesson_shared", { method: "link" });
      toast.success("Share link copied to clipboard!", { description: "Anyone with this link can continue the lesson." });
    } catch (err) {
      console.error("Share failed", err);
      toast.error(err.message || "Failed to generate share link");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ---- Retention Engine Handlers -----------------------------------------
  const handleSaveSnapshot = useCallback(() => {
    const title = window.prompt("Enter a title for this lesson (e.g. 'Database Normalization'):");
    if (!title) return;
    try {
      saveSnapshot(title, nodes, edges, chatHistory);
      track("snapshot_saved");
      toast.success(`Lesson "${title}" saved to Journal!`);
    } catch (err) {
      toast.error(err.message);
    }
  }, [nodes, edges, chatHistory]);

  const handleLoadSnapshot = useCallback((snap) => {
    if (!confirm(`Load "${snap.title}"? Current unsaved progress will be lost.`)) return;
    setNodes(snap.nodes || []);
    setEdges(snap.edges || []);
    setChatHistory(snap.chatHistory || []);
    setJournalOpen(false);
    toast.success(`Loaded "${snap.title}"`);
    setTimeout(() => triggerFitView(), 100);
  }, [setNodes, setEdges, triggerFitView]);

  const handleStartReview = useCallback((srsItem) => {
    setJournalOpen(false);
    setActiveReviewId(srsItem.id);
    const q = `I need to review the concept: "${srsItem.label}". Please quiz me on it using the 'quiz' action. Ensure it is multiple choice.`;
    executeTutor({ studentQuestion: q, nodes, edges }, true);
  }, [executeTutor, nodes, edges]);

  const handleQuizComplete = useCallback((passed, turnIdx) => {
    track("quiz_completed", { passed: !!passed });
    if (activeReviewId) {
      updateSRSItem(activeReviewId, passed);
      setActiveReviewId(null);
      toast.success(passed ? "Great job! Review interval increased." : "Keep studying! Review scheduled for tomorrow.", { icon: passed ? "🎉" : "💪" });
    }
  }, [activeReviewId]);

  // ---- Derived state ----
  const selectedNodeLabel = useMemo(
    () => selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.data?.label || selectedNodeId : null,
    [selectedNodeId, nodes]
  );
  const hasHighlightedNodes = useMemo(() => nodes.some((n) => n.data?.highlight), [nodes]);
  const isCanvasLarge = nodes.length > 25;

  // ---- JSX ----
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#fafafa] text-slate-900 font-sans antialiased supports-[height:100dvh]:h-[100dvh]">

      {/* ── Accessibility: Screen reader live region (Rule 20) ── */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {loading ? "Tutor is thinking, please wait." : ""}
        {chatHistory.length > 0 && !loading
          ? `Tutor replied: ${chatHistory[chatHistory.length - 1]?.text?.slice(0, 120) ?? ""}`
          : ""}
      </div>

      {/* ── Connectivity: Offline banner (Rule 13) ── */}
      {isOffline && (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-2 px-4 shadow-md"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          You're offline — the tutor won't respond until your connection is restored.
        </div>
      )}
      
      {/* ── Background Canvas (z-0) ── */}
      <div className={`absolute inset-0 z-0 transition-opacity ${mobileTab === "chat" ? "opacity-0 pointer-events-none sm:opacity-100 sm:pointer-events-auto" : "opacity-100"}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          onInit={(inst) => (reactFlowInstanceRef.current = inst)}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          className="bg-slate-50"
        >
          <Background color="#cbd5e1" gap={24} size={1.5} />
          <Controls className="mb-[60px] sm:mb-0 bg-white/90 backdrop-blur border-slate-200 shadow-sm" />
          
          {/* Floating Action Bar (Canvas Controls) */}
          <Panel position="bottom-right" className="flex items-center gap-2 mb-[60px] sm:mb-2 mr-2">
            <button
              onClick={handleShare}
              disabled={nodes.length <= 1}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Network size={14} className="text-violet-600" /> Share
            </button>
            <button
              onClick={handleExportPNG}
              disabled={nodes.length <= 1}
              title="Download diagram as PNG"
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} className="text-violet-600" /> Export
            </button>
          </Panel>

          {/* Highlight legend */}
          {hasHighlightedNodes && (
            <Panel position="bottom-left" className="ml-[420px] mb-4 hidden sm:flex items-center gap-2 bg-white/90 backdrop-blur border border-rose-200 rounded-full px-4 py-2 text-xs font-medium text-rose-700 shadow-sm pointer-events-none">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0 border border-white" />
              Highlighted — confusion detected
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* ── Floating Logo (Top Left) ── */}
      <div className="absolute top-5 left-5 z-20 hidden lg:flex items-center gap-3 bg-white/80 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-sm border border-slate-200/60 pointer-events-none">
        <img src="/dyna-learn-logo-blue.png" alt="Dyna-learn" className="h-8 object-contain contrast-125 saturate-150" />
        <div className="border-l border-slate-300 pl-3">
          <h1 className="text-[11px] font-bold tracking-widest text-slate-800 uppercase leading-none">Interactive Tutor</h1>
        </div>
      </div>

      {/* ── Floating Top Actions (Top Right) ── */}
      <header className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-xl px-2 py-2 rounded-2xl shadow-sm border border-slate-200/60">
        <button
          onClick={() => setJournalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-white/90 hover:shadow-sm transition"
        >
          <BookOpen size={14} className="text-violet-600" />
          <span className="hidden sm:inline">Journal</span>
        </button>
        <button
          onClick={handleSaveSnapshot}
          disabled={nodes.length <= 1}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition shadow-sm"
        >
          <Save size={14} />
          <span className="hidden sm:inline">Save</span>
        </button>
        <div className="w-px h-5 bg-slate-300 mx-1 hidden sm:block" />
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 text-xs font-semibold transition"
          title="Clear Canvas"
        >
          <Trash2 size={14} /> <span className="hidden md:inline">Clear</span>
        </button>
      </header>

      {/* ── Left panel: Chat Sidebar (Floating on Desktop, Full on Mobile) ── */}
      <div className={`absolute top-0 left-0 bottom-0 sm:top-20 sm:left-5 sm:bottom-5 w-full sm:w-[400px] z-10 flex flex-col bg-white/95 backdrop-blur-2xl sm:rounded-[2rem] shadow-2xl border-r sm:border border-slate-200/60 overflow-hidden transition-transform duration-300 ease-out pb-[60px] sm:pb-0 ${mobileTab === "chat" ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}`}>

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
              <label htmlFor="voice-select" className="sr-only">Choose a narration voice</label>
              <select
                id="voice-select"
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
            </div>
          </div>

          {/* Scrollable conversation + form */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
            {chatHistory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 mt-10">
                <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-violet-200/50">
                  <Brain size={24} />
                </div>
                <h3 className="text-slate-800 font-semibold mb-2">Welcome to Dyna-learn</h3>
                <p className="text-xs text-slate-500 mb-8 max-w-[200px] leading-relaxed">
                  Start typing below, or try one of these topics to see the canvas in action.
                </p>
                <div className="flex flex-col gap-2 w-full">
                  <button onClick={() => { setQuestion("Explain how a Database works."); }} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    Explain Database Architecture
                  </button>
                  <button onClick={() => { setQuestion("How does OAuth 2.0 work?"); }} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    How does OAuth 2.0 work?
                  </button>
                  <button onClick={() => { setQuestion("Draw a flowchart for the React Component Lifecycle."); }} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    React Component Lifecycle
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2">Conversation</p>
                <div className="space-y-2">
                  {chatHistory.map((turn, idx) => {
                    const isExpanded = expandedIds.has(idx);
                    const isLong = turn.text.length > 220;
                    const displayText = !isLong || isExpanded ? turn.text : turn.text.slice(0, 220) + "…";
                    return (
                      <div
                        key={idx}
                        className={`text-[13px] leading-relaxed ${
                          turn.role === "user"
                            ? "bg-slate-900 text-white rounded-[20px] rounded-br-sm px-4 py-3 ml-8 shadow-sm"
                            : "text-slate-800 pr-4 mt-2 mb-4"
                        }`}
                      >
                        {turn.role === "user" ? null : (
                          <div className="flex items-center gap-2 mb-1 opacity-60">
                            <Sparkles size={12} className="text-violet-600" />
                            <span className="font-semibold text-[10px] uppercase tracking-wider text-violet-700">Tutor</span>
                          </div>
                        )}

                        {/* Render tutor responses with markdown, user messages as plain text */}
                        {turn.role === "model" ? (
                          <>
                            <SimpleMarkdown text={displayText} className="mt-1 text-[13px] leading-relaxed" />
                            {turn.quiz && <QuizCard quiz={turn.quiz} onComplete={(passed) => handleQuizComplete(passed, idx)} />}
                          </>
                        ) : (
                          <div className="mt-1">
                            {turn.image && (
                              <img src={turn.image} alt="User uploaded" className="max-w-[120px] rounded mb-2 border border-slate-700/50" />
                            )}
                            <p className="whitespace-pre-wrap break-words">{displayText}</p>
                          </div>
                        )}

                        {isLong && (
                          <button
                            onClick={() => toggleExpand(idx)}
                            className={`mt-2 text-[10px] font-medium flex items-center gap-1 opacity-70 hover:opacity-100 ${turn.role === 'user' ? 'text-white' : 'text-slate-500'}`}
                          >
                            {isExpanded ? <>Show less <ChevronUp size={10} /></> : <>Read more <ChevronDown size={10} /></>}
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
          </div>

          {/* Fixed bottom area: Form & Mini-player */}
          <div className="p-4 bg-white border-t border-slate-100 shrink-0 flex flex-col gap-3">
            {/* Question form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              
              {selectedImage && (
                <div className="relative inline-block w-fit mb-[-4px]">
                  <img src={selectedImage.dataUrl} alt="Upload preview" className="h-16 w-auto rounded-md border border-slate-200 shadow-sm" />
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-white rounded-full text-slate-500 hover:text-red-600 transition"
                  >
                    <XCircle size={16} className="fill-white" />
                  </button>
                </div>
              )}

              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl+Enter (or Cmd+Enter on Mac) submits
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !loading && (question.trim() || selectedImage)) {
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
                disabled={loading || isOffline}
                aria-disabled={loading || isOffline}
                aria-label="Ask the tutor a question"
                aria-describedby={loading ? "submit-hint-loading" : isOffline ? "submit-hint-offline" : undefined}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 focus:bg-white transition resize-none disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  aria-label="Upload an image to analyze"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  aria-label="Upload image"
                  title="Upload image (max 5MB)"
                  className="flex-none flex items-center justify-center w-12 rounded-xl border bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Image size={18} aria-hidden="true" />
                </button>
                {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                  <button
                    type="button"
                    onPointerDown={handleVoiceStart}
                    onPointerUp={handleVoiceStop}
                    onPointerLeave={handleVoiceStop}
                    disabled={loading}
                    aria-label={isListening ? "Listening… release to stop" : "Hold to speak"}
                    title="Hold to speak"
                    className={`flex-none flex items-center justify-center w-12 rounded-xl border transition ${
                      isListening
                        ? "bg-red-500 border-red-600 text-white animate-pulse"
                        : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Mic size={18} />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || isOffline || (!question.trim() && !selectedImage)}
                  aria-label={loading ? "Tutor is thinking" : "Send your question to the tutor"}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-medium text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Thinking…</>
                    : <><Send size={16} aria-hidden="true" /> Ask Tutor</>}
                </button>
              </div>
              {loading && (
                <p id="submit-hint-loading" className="text-xs text-center text-violet-600">
                  Tutor is thinking — canvas will update when done
                </p>
              )}
              {isOffline && !loading && (
                <p id="submit-hint-offline" className="text-xs text-center text-amber-600 font-medium">
                  ⚠ You're offline — reconnect to send a message
                </p>
              )}
            </form>


            {/* Last-speech mini-player */}
            {lastSpeech && (
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
              </div>
            )}
          </div>
        </div>
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-30 flex bg-white/90 backdrop-blur-md border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-medium transition ${
            mobileTab === "chat"
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px bg-violet-50/50"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
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
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px bg-violet-50/50"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
          aria-label="Canvas panel"
        >
          <Network size={18} className="mb-0.5" />
          Canvas
        </button>
      </div>

      {journalOpen && (
        <Suspense fallback={null}>
          <JournalModal
            open={journalOpen}
            onClose={() => setJournalOpen(false)}
            onLoadSnapshot={handleLoadSnapshot}
            onStartReview={handleStartReview}
          />
        </Suspense>
      )}
    </div>
  );
}
