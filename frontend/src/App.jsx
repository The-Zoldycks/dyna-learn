import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Send, Loader2, Volume2, Sparkles, Trash2, MousePointerClick,
  ChevronUp, ChevronDown, Mic,
  MessageSquare, Network, Download, Save, BookOpen, Image, XCircle, Brain, Compass, Map, Search, Droplets, FolderKanban,
  Target, Lightbulb, Sprout, AlertTriangle, Trophy, Dumbbell, MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import CustomNode from "./components/CustomNode.jsx";

import ChatSkeleton from "./components/ChatSkeleton.jsx";
import SimpleMarkdown from "./components/SimpleMarkdown.jsx";
import QuizCard from "./components/QuizCard.jsx";
import UserMenu from "./components/UserMenu.jsx";
const JournalModal = lazy(() => import("./components/JournalModal.jsx"));
const TopicExplorerModal = lazy(() => import("./components/TopicExplorerModal.jsx"));
const FlashcardPracticeModal = lazy(() => import("./components/FlashcardPracticeModal.jsx"));
const FluidBackdrop = lazy(() => import("./components/FluidBackdrop.jsx"));
const AuthModal = lazy(() => import("./components/AuthModal.jsx"));
const SessionDrawer = lazy(() => import("./components/SessionDrawer.jsx"));
import AdaptingIndicator from "./components/AdaptingIndicator.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useTTS } from "./hooks/useTTS.js";
import { useImageAttachment } from "./hooks/useImageAttachment.js";
import { useSessions } from "./hooks/useSessions.js";
import { getLayoutedElements } from "./utils/layout.js";
import { updateStreakOnLoad, saveSnapshot, logHighlightToSRS, updateSRSItem } from "./utils/storage.js";
import { buildDiagramSVG, svgToPngBlob, encodeShareHash, decodeShareHash, buildAnkiCSV } from "./utils/export.js";
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

  // Unified speech (Edge Neural + browser fallback) — extracted hook
  const {
    browserVoices, edgeVoices, selectedVoice, setSelectedVoice,
    playbackSpeed, cyclePlaybackSpeed,
    autoNarrate, setAutoNarrate,
    isTTSLoading, isSpeaking, isPaused, lastSpeech, setLastSpeech,
    speakText,     pauseSpeech, resumeSpeech, stopSpeech, handleReplay,
  } = useTTS(API_BASE);

  // Image attachment (select / drag-drop / paste) — extracted hook
  const {
    selectedImage, clearImage,
    isDraggingImage, fileInputRef,
    handleImageChange, handleDragOver, handleDragLeave, handleDrop, handlePaste,
  } = useImageAttachment({ loading });

  const [chatHistory, setChatHistory] = useState(() => sessionRead(SESSION_CHAT, []));
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "canvas"
  // Fluid cursor backdrop — default on for fine pointers unless reduced motion is preferred
  const [fluidOn, setFluidOn] = useState(() => {
    try {
      const saved = localStorage.getItem("dyna-fluid");
      if (saved !== null) return saved === "1";
      const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      return fine && !reduced;
    } catch {
      return true;
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [topicExplorerOpen, setTopicExplorerOpen] = useState(false);
  const [practiceModalOpen, setPracticeModalOpen] = useState(false);
  const [practiceItems, setPracticeItems] = useState([]);
  const [activeReviewId, setActiveReviewId] = useState(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Collapsible audio panels — collapsed by default so the tutor response area stays clean
  const [voiceOpen, setVoiceOpen] = useState(
    () => { try { return localStorage.getItem("dyna-voice-open") === "1"; } catch { return false; } }
  );
  const [playerOpen, setPlayerOpen] = useState(
    () => { try { return localStorage.getItem("dyna-player-open") === "1"; } catch { return false; } }
  );

  const {
    user,
    profile,
    initials,
    loginWithGoogle,
    loginWithPassword,
    signUpWithPassword,
    logout,
    requestPasswordReset,
  } = useAuth();

  const recognitionRef = useRef(null);
  const moreMenuRef = useRef(null);

  const lastPayloadRef = useRef(null);
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
        const decoded = decodeShareHash(payload);
        if (decoded?.nodes?.length) setNodes(decoded.nodes);
        if (decoded?.edges) setEdges(decoded.edges);
        // Strip hash cleanly without refreshing
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        toast.success("Shared canvas loaded!", { duration: 3000 });
      } catch (err) {
        toast.error("Failed to load shared canvas", { description: "Link might be corrupted or invalid." });
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
        const { image: _image, ...rest } = turn;
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

  // ---- Node deletion cleanup ----
  const onNodesDelete = useCallback((deletedNodes) => {
    const deletedIds = new Set(deletedNodes.map((n) => n.id));
    setEdges((eds) => eds.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
    setSelectedNodeId((cur) => (deletedIds.has(cur) ? null : cur));
  }, [setEdges]);

  // ---- Custom Node Toolbar 'Ask AI', 'Branch out', and 'Delete' listeners ----
  useEffect(() => {
    const handleAskNode = (e) => {
      setQuestion(`Explain "${e.detail}" in more detail.`);
      setMobileTab("chat"); // ensure we switch to chat on mobile
      setTimeout(() => {
        const textarea = document.querySelector("textarea");
        if (textarea) textarea.focus();
      }, 50);
    };
    const handleBranchNode = (e) => {
      setQuestion(`Break down "${e.detail}" into sub-concepts and expand the diagram.`);
      setMobileTab("chat");
      setTimeout(() => {
        const textarea = document.querySelector("textarea");
        if (textarea) textarea.focus();
      }, 50);
    };
    const handleDeleteNode = (e) => {
      const { id, label } = e.detail;
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
      setSelectedNodeId((cur) => (cur === id ? null : cur));
      toast.success(`Removed "${label}"`);
    };
    window.addEventListener("ask-node", handleAskNode);
    window.addEventListener("branch-node", handleBranchNode);
    window.addEventListener("delete-node", handleDeleteNode);
    return () => {
      window.removeEventListener("ask-node", handleAskNode);
      window.removeEventListener("branch-node", handleBranchNode);
      window.removeEventListener("delete-node", handleDeleteNode);
    };
  }, [setNodes, setEdges]);

  // ---- Header "More" overflow menu: close on outside click / Escape ----
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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

  // Persist UI prefs (voice + speed owned by useTTS)
  useEffect(() => { try { localStorage.setItem("dyna-fluid", fluidOn ? "1" : "0"); } catch {} }, [fluidOn]);
  useEffect(() => { try { localStorage.setItem("dyna-voice-open", voiceOpen ? "1" : "0"); } catch {} }, [voiceOpen]);
  useEffect(() => { try { localStorage.setItem("dyna-player-open", playerOpen ? "1" : "0"); } catch {} }, [playerOpen]);

  // ---- Helpers ----
  const toggleExpand = (idx) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ---- Speech controls come from useTTS (speakText, pauseSpeech, resumeSpeech, stopSpeech, cleanupAudio) ----

  // ---- Imperative fitView via React Flow instance ----
  const triggerFitView = useCallback((nodeIds = null) => {
    if (!reactFlowInstanceRef.current) return;
    const opts = { duration: 500, padding: 0.25 };
    if (nodeIds?.length) opts.nodes = nodeIds.map((id) => ({ id }));
    reactFlowInstanceRef.current.fitView(opts);
  }, []);

  const handleRestoreSession = useCallback(
    ({ nodes: newNodes, edges: newEdges, chatHistory: newChat }) => {
      setNodes(newNodes || []);
      setEdges(newEdges || []);
      setChatHistory(newChat || []);
      setSelectedNodeId(null);
      setTimeout(() => triggerFitView(), 100);
    },
    [setNodes, setEdges, triggerFitView]
  );

  const {
    sessions,
    activeSessionId,
    activeSessionTitle,
    isSaving,
    conflictData,
    saveSession,
    openSession,
    createNewSession,
    deleteSession,
    renameSession,
    triggerIdleAutoSave,
    resolveConflictReload,
    resolveConflictSaveCopy,
  } = useSessions({
    user,
    nodes,
    edges,
    chatHistory,
    onRestoreSession: handleRestoreSession,
  });

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
        // Strip the initial welcome node as soon as real lesson nodes arrive
        const baseNodes = fN.length > 0 ? prevNodes.filter((n) => n.id !== "start") : prevNodes;
        const ids = new Set(baseNodes.map((n) => n.id));
        const toAdd = fN.filter((n) => !ids.has(n.id));
        const mergedNodes = [...baseNodes, ...toAdd];
        setEdges((prevEdges) => {
          const baseEdges = prevEdges.filter((e) => e.source !== "start" && e.target !== "start");
          const eIds = new Set(baseEdges.map((e) => e.id));
          const toAddE = fE.filter(
            (e) =>
              !eIds.has(e.id) &&
              mergedNodes.some((n) => n.id === e.source) &&
              mergedNodes.some((n) => n.id === e.target)
          );
          const mergedEdges = [...baseEdges, ...toAddE];
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
        signal: AbortSignal.timeout(90000),
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
          if (autoNarrate) {
            speakText(speech_text);
          } else {
            setLastSpeech(speech_text);
          }
        }
        setChatHistory((prev) => {
          const next = [
            ...prev,
            { role: "user", text: payload.studentQuestion, image: payload.image?.previewUrl || null },
            { role: "model", text: speech_text || "", quiz: quiz || null }
          ];
          return next.slice(-6);
        });
      } else {
        setChatHistory((prev) => [...prev, { role: "user", text: payload.studentQuestion, image: payload.image?.previewUrl || null }].slice(-6));
      }

      if (diagram_update && diagram_update.action !== "quiz") {
        applyDiagramUpdateStable(diagram_update);
      }
      if (retryLabel) toast.dismiss();
      track("question_asked", { hasImage: !!payload.image, nodeSelected: !!payload.selectedNodeId });
      triggerIdleAutoSave();
      return true;
    } catch (err) {
      console.error(err);
      const code = err.code || "";
      const isRateLimit =
        code === "GEMINI_RATE_LIMIT" ||
        (err.message || "").includes("429") ||
        (err.message || "").includes("rate limit");
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
      const isNetwork =
        err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message || "");
      const description = isRateLimit
        ? "Gemini free-tier limit hit — wait ~20s before retrying."
        : isTimeout
          ? "Request timed out after 90s — backend may be busy. Retry in a moment."
          : isNetwork
            ? "Cannot reach backend — check your internet connection, then Retry."
            : err.message || "Failed to fetch tutor response";

      toast.error(isRateLimit ? "Rate limit hit" : isNetwork || isTimeout ? "Connection problem" : "Tutor unavailable", {
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
  }, [speakText, setLastSpeech, applyDiagramUpdateStable, autoNarrate, triggerIdleAutoSave]);

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
      const { image: _image, ...rest } = turn;
      return rest;
    });

    const payload = {
      studentQuestion: question.trim() || "What's in this image?",
      canvasState,
      flowchartState: canvasState, // legacy compat
      chatHistory: cleanHistory,
      selectedNodeId,
      image: selectedImage ? { base64: selectedImage.base64, mimeType: selectedImage.mimeType } : null,
    };
    const ok = await executeTutor(payload);
    if (ok) {
      setQuestion("");
      clearImage();
    }
  };

  const handleClear = () => {
    clearImage();
    setNodes(initialNodes); setEdges(initialEdges); setChatHistory([]); setSelectedNodeId(null);
    stopSpeech(); setLastSpeech("");
    setExpandedIds(new Set()); lastPayloadRef.current = null;
    sessionClear(); // also wipe sessionStorage
    toast.success("Canvas cleared", { duration: 3000, description: "Welcome node restored — ask a new question" });
  };

  const renderDiagramPng = useCallback(async () => {
    const instance = reactFlowInstanceRef.current;
    if (!instance) return null;
    const svg = buildDiagramSVG(instance.getNodes(), instance.getEdges());
    if (!svg) return null;
    return svgToPngBlob(svg.text, svg.W, svg.H);
  }, []);

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

  const handleExportSVG = useCallback(() => {
    const instance = reactFlowInstanceRef.current;
    if (!instance) return;
    try {
      const built = buildDiagramSVG(instance.getNodes(), instance.getEdges());
      if (!built) return;
      const blob = new Blob([built.text], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `dyna-learn-${Date.now()}.svg`;
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
      track("diagram_exported", { format: "svg" });
      toast.success("Diagram exported as vector SVG!", { duration: 2500 });
    } catch (err) {
      console.error("SVG export failed:", err);
      toast.error("SVG export failed — try again.");
    }
  }, []);

  const handleExportAnki = useCallback(() => {
    try {
      const csv = buildAnkiCSV(nodes, edges);
      if (!csv) {
        toast.info("Add some concept nodes to export Anki flashcards.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `dyna-learn-anki-${Date.now()}.csv`;
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
      track("diagram_exported", { format: "anki_csv" });
      toast.success("Anki flashcards CSV exported!", {
        description: "Ready to import into Anki (Basic front/back cards).",
      });
    } catch (err) {
      console.error("Anki export failed:", err);
      toast.error("Failed to generate Anki CSV.");
    }
  }, [nodes, edges]);

  // ---- Voice Input (tap-to-toggle with auto-append) ---------------------
  const toggleVoice = useCallback((e) => {
    e.preventDefault();
    if (loading) return;
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
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
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setQuestion((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [loading, isListening]);

  // ---- Image attachment handlers come from useImageAttachment ----

  const handleShare = useCallback(async () => {
    if (nodes.length <= 1) return;
    try {
      const b64 = encodeShareHash(nodes, edges);
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
  }, [nodes, edges, renderDiagramPng]);

  // ---- Retention Engine Handlers -----------------------------------------
  const handleSaveWorkspace = useCallback(() => {
    if (user) {
      const defaultTitle = activeSessionTitle || "Study Session";
      const title = window.prompt("Save workspace as:", defaultTitle);
      if (!title) return;
      saveSession({ title, isManual: true });
    } else {
      const title = window.prompt("Enter a title for this lesson (e.g. 'Database Normalization'):");
      if (!title) return;
      try {
        saveSnapshot(title, nodes, edges, chatHistory);
        track("snapshot_saved");
        toast.success(`Lesson "${title}" saved to local Journal!`, {
          action: {
            label: "Sign in to sync",
            onClick: () => setAuthModalOpen(true),
          },
        });
      } catch (err) {
        toast.error(err.message);
      }
    }
  }, [user, activeSessionTitle, saveSession, nodes, edges, chatHistory]);

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

  const handleQuizComplete = useCallback((passed, _turnIdx) => {
    track("quiz_completed", { passed: !!passed });
    if (activeReviewId) {
      updateSRSItem(activeReviewId, passed);
      setActiveReviewId(null);
      toast.success(passed ? "Great job! Review interval increased." : "Keep studying! Review scheduled for tomorrow.", { icon: passed ? <Trophy size={14} className="text-violet-600" /> : <Dumbbell size={14} className="text-violet-600" /> });
    }
  }, [activeReviewId]);

  const handleSelectTopic = useCallback((topic) => {
    setTopicExplorerOpen(false);
    const layouted = getLayoutedElements(topic.nodes, topic.edges);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setChatHistory([]);
    setSelectedNodeId(null);
    setQuestion(topic.prompt);
    toast.success(`Loaded "${topic.title}"`, { description: "Tutor is starting the lesson..." });
    setTimeout(() => {
      triggerFitView();
      executeTutor({ studentQuestion: topic.prompt, nodes: layouted.nodes, edges: layouted.edges });
    }, 250);
  }, [setNodes, setEdges, triggerFitView, executeTutor]);

  const handleStartPractice = useCallback((items) => {
    setJournalOpen(false);
    setPracticeItems(items);
    setPracticeModalOpen(true);
  }, []);

  // ---- Derived state ----
  const selectedNodeLabel = useMemo(
    () => selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.data?.label || selectedNodeId : null,
    [selectedNodeId, nodes]
  );
  const hasHighlightedNodes = useMemo(() => nodes.some((n) => n.data?.highlight), [nodes]);
  const isCanvasLarge = nodes.length > 25;

  const filteredChat = useMemo(() => {
    if (!chatSearchQuery.trim()) {
      return chatHistory.map((turn, originalIdx) => ({ turn, originalIdx }));
    }
    const q = chatSearchQuery.trim().toLowerCase();
    return chatHistory
      .map((turn, originalIdx) => ({ turn, originalIdx }))
      .filter(({ turn }) => {
        const matchText = (turn.text || "").toLowerCase().includes(q);
        const matchQuiz = (turn.quiz?.question || "").toLowerCase().includes(q) ||
          (turn.quiz?.options || []).some((opt) => opt.toLowerCase().includes(q));
        return matchText || matchQuiz;
      });
  }, [chatHistory, chatSearchQuery]);

  // ---- JSX ----
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#fafafa] text-slate-900 font-sans antialiased supports-[height:100dvh]:h-[100dvh]">
      {fluidOn && (
        <Suspense fallback={null}>
          <FluidBackdrop />
        </Suspense>
      )}

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
      <div id="canvas-panel" className={`absolute inset-0 z-0 transition-opacity ${mobileTab === "chat" ? "opacity-0 pointer-events-none sm:opacity-100 sm:pointer-events-auto" : "opacity-100"}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={(inst) => (reactFlowInstanceRef.current = inst)}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          className="bg-slate-50"
        >
          <Background color="#cbd5e1" gap={24} size={1.5} />
          <Controls className="mb-[60px] sm:mb-0 bg-white/90 backdrop-blur border-slate-200 shadow-sm" />

          {/* Collapsible Canvas Radar Minimap — bottom-right, parked clearly above action bar */}
          {showMinimap && (
            <MiniMap
              position="bottom-right"
              className="mb-[150px] sm:!bottom-20 sm:mb-0 mr-2 !bg-white/90 !backdrop-blur-md !border !border-slate-200 !rounded-2xl !shadow-lg overflow-hidden"
              nodeColor={(n) => (n.data?.highlight ? "#fb7185" : "#8b5cf6")}
              maskColor="rgba(241, 245, 249, 0.7)"
              zoomable
              pannable
            />
          )}

          {/* Floating Action Bar (Canvas Controls) */}
          <Panel position="bottom-right" className="flex items-center gap-2 mb-[60px] sm:mb-2 mr-2">
            <button
              onClick={() => setShowMinimap((prev) => !prev)}
              title={showMinimap ? "Hide canvas minimap" : "Show canvas minimap"}
              aria-label="Toggle canvas minimap"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full border shadow-sm transition ${
                showMinimap
                  ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                  : "bg-white/90 backdrop-blur border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Map size={13} /> <span className="hidden sm:inline">{showMinimap ? "Hide Map" : "Minimap"}</span>
            </button>
            <button
              onClick={handleShare}
              disabled={nodes.length <= 1}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-full px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Network size={14} className="text-violet-600" /> Share
            </button>
            <div className="flex items-center bg-white/90 backdrop-blur border border-slate-200 rounded-full shadow-sm overflow-hidden p-0.5">
              <button
                onClick={handleExportPNG}
                disabled={nodes.length <= 1}
                title="Download diagram as PNG image"
                aria-label="Download diagram as PNG"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed rounded-full"
              >
                <Download size={13} className="text-violet-600" /> PNG
              </button>
              <div className="w-px h-3.5 bg-slate-200" />
              <button
                onClick={handleExportSVG}
                disabled={nodes.length <= 1}
                title="Download diagram as scalable vector SVG"
                aria-label="Download diagram as SVG"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed rounded-full"
              >
                SVG
              </button>
              <div className="w-px h-3.5 bg-slate-200" />
              <button
                onClick={handleExportAnki}
                disabled={nodes.length <= 1}
                title="Export concepts as Anki flashcards (.csv)"
                aria-label="Export as Anki flashcards"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed rounded-full"
              >
                Anki
              </button>
            </div>
          </Panel>

          {/* Highlight legend */}
          {hasHighlightedNodes && (
            <Panel position="bottom-center" className="mb-[70px] sm:mb-4 flex items-center gap-2 bg-white/90 backdrop-blur border border-rose-200 rounded-full px-4 py-2 text-xs font-medium text-rose-700 shadow-sm pointer-events-none">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0 border border-white" />
              Highlighted — confusion detected
            </Panel>
          )}
          {loading && nodes.length > 1 && (
            <Panel position="top-center" className="pointer-events-none mt-4">
              <AdaptingIndicator size={24} />
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
      <header className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-xl px-2 py-2 rounded-2xl shadow-sm border border-slate-200/60 max-w-[calc(100vw-2rem)]">
        <div className="hidden sm:flex items-center gap-2">
        <button
          onClick={() => setSessionDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-white/90 hover:shadow-sm transition"
          title="Open study workspaces"
        >
          <FolderKanban size={14} className="text-violet-600" />
          <span className="hidden sm:inline">Sessions</span>
        </button>
        <button
          onClick={() => setTopicExplorerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-white/90 hover:shadow-sm transition"
        >
          <Compass size={14} className="text-violet-600" />
          <span className="hidden sm:inline">Topics</span>
        </button>
        <button
          onClick={() => setJournalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-white/90 hover:shadow-sm transition"
        >
          <BookOpen size={14} className="text-violet-600" />
          <span className="hidden sm:inline">Journal</span>
        </button>
        </div>
        <button
          onClick={handleSaveWorkspace}
          disabled={nodes.length <= 1 || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition shadow-sm"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span className="hidden sm:inline">{isSaving ? "Saving…" : "Save"}</span>
        </button>
        <div className="hidden sm:flex items-center gap-2">
        <button
          onClick={() => setFluidOn((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border ${
            fluidOn
              ? "bg-violet-50 text-violet-700 border-violet-200/80 shadow-sm"
              : "text-slate-400 border-transparent hover:text-slate-600"
          }`}
          title={fluidOn ? "Turn off ambient backdrop" : "Turn on ambient backdrop"}
          aria-label={fluidOn ? "Turn off ambient fluid animation" : "Turn on ambient fluid animation"}
        >
          <Droplets size={13} className={fluidOn ? "text-violet-600" : "text-slate-400"} />
        </button>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 text-xs font-semibold transition"
          title="Clear Canvas"
        >
          <Trash2 size={14} /> <span className="hidden md:inline">Clear</span>
        </button>
        </div>
        {/* Mobile overflow menu */}
        <div className="relative sm:hidden" ref={moreMenuRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="More actions"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-white/90 border border-transparent transition min-h-[44px]"
          >
            <MoreHorizontal size={16} className="text-violet-600" />
          </button>
          {moreOpen && (
            <div role="menu" aria-label="More actions" className="absolute right-0 mt-2 w-52 rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-50">
              <button role="menuitem" onClick={() => { setMoreOpen(false); setSessionDrawerOpen(true); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left min-h-[44px]">
                <FolderKanban size={14} className="text-violet-600" /> Sessions
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); setTopicExplorerOpen(true); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left min-h-[44px]">
                <Compass size={14} className="text-violet-600" /> Topics
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); setJournalOpen(true); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left min-h-[44px]">
                <BookOpen size={14} className="text-violet-600" /> Journal
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); setFluidOn((v) => !v); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left min-h-[44px]">
                <Droplets size={14} className="text-violet-600" /> {fluidOn ? "Backdrop off" : "Backdrop on"}
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); handleClear(); }} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition text-left min-h-[44px]">
                <Trash2 size={14} className="text-violet-600" /> Clear canvas
              </button>
            </div>
          )}
        </div>

        {/* User Account Menu / Sign In */}
        <UserMenu
          user={user}
          profile={profile}
          initials={initials}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenSessions={() => setSessionDrawerOpen(true)}
          onLogout={logout}
        />
      </header>

      {/* ── Left panel: Chat Sidebar (Floating on Desktop, Full on Mobile) ── */}
      <div id="chat-panel" className={`absolute top-0 left-0 bottom-0 sm:top-20 sm:left-5 sm:bottom-5 w-full sm:w-[400px] z-10 flex flex-col bg-white/95 backdrop-blur-2xl sm:rounded-[2rem] shadow-2xl border-r sm:border border-slate-200/60 overflow-hidden transition-transform duration-300 ease-out pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0 ${mobileTab === "chat" ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}`}>

          {/* Panel header */}
          <div className="p-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
                <Sparkles size={14} className="text-violet-600" /> Ask Dyna-learn
              </h2>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setChatSearchOpen((prev) => !prev);
                    if (chatSearchOpen) setChatSearchQuery("");
                  }}
                  className={`p-1.5 rounded-lg border transition ${
                    chatSearchOpen
                      ? "bg-violet-100 text-violet-700 border-violet-300"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                  aria-label={chatSearchOpen ? "Close chat search" : "Search conversation"}
                  title="Search conversation"
                >
                  <Search size={13} />
                </button>
              )}
            </div>
            {chatSearchOpen && (
              <div className="mt-2.5 relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  placeholder="Search discussion..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                  autoFocus
                />
                {chatSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setChatSearchQuery("")}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">Click a node + ask — tutor adapts to canvas &amp; history.</p>

            {/* Selected node badge & quick actions */}
            {selectedNodeId && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                  <MousePointerClick size={12} className="text-violet-600 shrink-0" />
                  <span className="font-medium text-violet-700 shrink-0">Selected:</span>
                  <span className="truncate flex-1 font-semibold text-violet-950">{selectedNodeLabel}</span>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    aria-label="Deselect node"
                    className="text-violet-600 hover:text-violet-800 underline ml-2 text-[11px]"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(`Explain "${selectedNodeLabel}" in depth and how it works.`);
                      document.querySelector("textarea")?.focus();
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 text-slate-700 hover:text-violet-700 px-2.5 py-1 rounded-md transition shadow-sm inline-flex items-center gap-1"
                  >
                    <Search size={11} className="text-violet-600" /> Deep dive
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(`Break down "${selectedNodeLabel}" into sub-concepts on the canvas.`);
                      document.querySelector("textarea")?.focus();
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 text-slate-700 hover:text-violet-700 px-2.5 py-1 rounded-md transition shadow-sm inline-flex items-center gap-1"
                  >
                    <Sprout size={11} className="text-violet-600" /> Break down
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(`Quiz me on "${selectedNodeLabel}".`);
                      document.querySelector("textarea")?.focus();
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 text-slate-700 hover:text-violet-700 px-2.5 py-1 rounded-md transition shadow-sm inline-flex items-center gap-1"
                  >
                    <Target size={11} className="text-violet-600" /> Quiz me
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuestion(`Give a real-world analogy or example for "${selectedNodeLabel}".`);
                      document.querySelector("textarea")?.focus();
                    }}
                    className="text-[11px] font-medium bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-300 text-slate-700 hover:text-violet-700 px-2.5 py-1 rounded-md transition shadow-sm inline-flex items-center gap-1"
                  >
                    <Lightbulb size={11} className="text-violet-600" /> Analogy
                  </button>
                </div>
              </div>
            )}

            {/* Large-canvas warning */}
            {isCanvasLarge && (
              <div className="mt-2 flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-700 inline-flex items-center gap-1.5"><AlertTriangle size={12} className="text-amber-600 shrink-0" /> Large canvas ({nodes.length} nodes) — consider clearing for best AI results.</span>
              </div>
            )}

            {/* Voice selector — collapsible, collapsed by default */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setVoiceOpen((v) => !v)}
                aria-expanded={voiceOpen}
                aria-controls="voice-panel"
                className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 px-3 py-2.5 hover:bg-slate-100/70 transition"
              >
                <Mic size={12} className="text-violet-600" /> Voice
                <span className="ml-2 text-[10px] font-medium text-slate-400">
                  {edgeVoices.length + browserVoices.length} voices{autoNarrate ? " · auto" : ""}
                </span>
                <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${voiceOpen ? "rotate-180" : ""}`} />
              </button>
              {voiceOpen && (
              <div id="voice-panel" className="px-3 pb-3">
              <label htmlFor="voice-select" className="sr-only">Choose a narration voice</label>
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
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
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/60">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoNarrate}
                    onChange={(e) => setAutoNarrate(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[11px] font-medium text-slate-600">Auto-narrate</span>
                </label>
                <button
                  type="button"
                  onClick={cyclePlaybackSpeed}
                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-violet-300 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 transition"
                  title="Cycle playback speed (1x, 1.25x, 1.5x, 2x)"
                  aria-label={`Playback speed: ${playbackSpeed}x. Click to change.`}
                >
                  {playbackSpeed}x speed
                </button>
              </div>
              </div>
              )}
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
                  <button
                    onClick={() => setTopicExplorerOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[13px] font-semibold transition shadow-sm"
                  >
                    <Compass size={16} /> Explore Topic Starters
                  </button>
                  <button onClick={() => { setQuestion("Explain Database Normalization (1NF to BCNF)."); }} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    Database Normalization
                  </button>
                  <button onClick={() => { setQuestion("How does OAuth 2.0 work?"); }} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    OAuth 2.0 Auth Code Flow
                  </button>
                  <button onClick={() => { setQuestion("Draw a flowchart for the React Component Lifecycle."); }} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 hover:border-violet-300 hover:shadow-sm hover:text-violet-700 transition">
                    React Component Lifecycle
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    {chatSearchQuery.trim()
                      ? `Found ${filteredChat.length} match${filteredChat.length === 1 ? "" : "es"}`
                      : "Conversation"}
                  </p>
                  {loading && chatHistory.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1">
                      <img src="/mahoraga-wheel.png" alt="" aria-hidden="true" className="mahoraga-wheel aspect-square object-contain shrink-0" style={{ width: 14, height: 14 }} />
                      <span className="text-[10px] font-semibold text-violet-700">Adapting</span>
                    </span>
                  ) : chatSearchQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setChatSearchQuery("")}
                      className="text-[11px] text-violet-600 hover:text-violet-800 font-medium"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>

                {filteredChat.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 my-2">
                    <Search size={18} className="mx-auto text-slate-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-700">No matching messages</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Nothing matches &ldquo;{chatSearchQuery}&rdquo;.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredChat.map(({ turn, originalIdx }) => {
                      const isExpanded = expandedIds.has(originalIdx);
                      const isLong = turn.text.length > 220;
                      const displayText = !isLong || isExpanded ? turn.text : turn.text.slice(0, 220) + "…";
                      return (
                        <div
                          key={originalIdx}
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
                              {turn.quiz && <QuizCard quiz={turn.quiz} onComplete={(passed) => handleQuizComplete(passed, originalIdx)} />}
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
                              onClick={() => toggleExpand(originalIdx)}
                              className={`mt-2 text-[10px] font-medium flex items-center gap-1 opacity-70 hover:opacity-100 ${turn.role === 'user' ? 'text-white' : 'text-slate-500'}`}
                            >
                              {isExpanded ? <>Show less <ChevronUp size={10} /></> : <>Read more <ChevronDown size={10} /></>}
                            </button>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {loading && <ChatSkeleton />}

            {/* Auto-scroll sentinel */}
            <div ref={chatBottomRef} />
          </div>

          {/* Fixed bottom area: Form & Mini-player */}
          <div className="p-4 bg-white border-t border-slate-100 shrink-0 flex flex-col gap-3">
            {/* Question form */}
            <form
              onSubmit={handleSubmit}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="relative flex flex-col gap-3"
            >
              {/* Drag-and-drop overlay */}
              {isDraggingImage && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-violet-50/95 border-2 border-dashed border-violet-500 rounded-xl backdrop-blur-sm pointer-events-none transition-all">
                  <Image size={24} className="text-violet-600 mb-1 animate-bounce" />
                  <p className="text-xs font-semibold text-violet-900">Drop image here to attach</p>
                  <p className="text-[10px] text-violet-600 mt-0.5">Under 5MB · PNG, JPG, WebP</p>
                </div>
              )}

              {selectedImage && (
                <div className="relative inline-block w-fit mb-[-4px]">
                  <img src={selectedImage.previewUrl} alt="Upload preview" className="h-16 w-auto rounded-md border border-slate-200 shadow-sm" />
                  <button
                    type="button"
                    onClick={() => clearImage()}
                    aria-label="Remove attached image"
                    className="absolute -top-2 -right-2 bg-white rounded-full text-slate-500 hover:text-red-600 transition"
                  >
                    <XCircle size={16} className="fill-white" />
                  </button>
                </div>
              )}

              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onPaste={handlePaste}
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
                    onClick={toggleVoice}
                    disabled={loading}
                    aria-label={isListening ? "Listening… click to stop" : "Click to dictate"}
                    title={isListening ? "Click to stop dictation" : "Click to dictate"}
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
                  aria-label={loading ? "Adapting diagram" : "Send your question to the tutor"}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Thinking…</>
                    : <><Send size={16} aria-hidden="true" /> Ask Tutor</>}
                </button>
              </div>
              {loading && (
                <p id="submit-hint-loading" className="text-xs text-center text-violet-600 flex items-center justify-center gap-1.5">
                  <img src="/mahoraga-wheel.png" alt="" aria-hidden="true" className="mahoraga-wheel aspect-square object-contain shrink-0" style={{ width: 16, height: 16 }} />
                  Adapting — canvas will update when done
                </p>
              )}
              {isOffline && !loading && (
                <p id="submit-hint-offline" className="text-xs text-center text-amber-600 font-medium flex items-center justify-center gap-1">
                  <span className="w-3 h-3 flex items-center justify-center"><svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></span>
                  You're offline — reconnect to send a message
                </p>
              )}
            </form>


            {/* Last-speech mini-player — collapsible, collapsed by default */}
            {lastSpeech && (
              <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPlayerOpen((v) => !v)}
                  aria-expanded={playerOpen}
                  aria-controls="last-explanation-panel"
                  className="w-full flex items-center gap-2 text-xs font-semibold text-slate-700 px-3 py-2.5 hover:bg-slate-50 transition"
                >
                  {isTTSLoading
                    ? <Loader2 size={12} className="text-violet-600 animate-spin" />
                    : <Volume2 size={12} className={isSpeaking ? "text-violet-600 animate-pulse" : ""} />}
                  Last Explanation
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
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
                  <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${playerOpen ? "rotate-180" : ""}`} />
                </button>
                {playerOpen && (
                <div id="last-explanation-panel" className="px-3 pb-3">
                <div className="flex gap-1 mb-2">
                  <button onClick={handleReplay} disabled={isSpeaking || isTTSLoading} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-xs disabled:opacity-40">Replay</button>
                  <button onClick={isPaused ? resumeSpeech : pauseSpeech} disabled={!isSpeaking && !isPaused} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">{isPaused ? "Resume" : "Pause"}</button>
                  <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused && !isTTSLoading} className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-xs disabled:opacity-40">Stop</button>
                  <button
                    type="button"
                    onClick={cyclePlaybackSpeed}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-violet-300 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition"
                    title="Cycle playback speed"
                    aria-label={`Playback speed: ${playbackSpeed}x. Click to change.`}
                  >
                    {playbackSpeed}x
                  </button>
                </div>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      <div className="sm:hidden absolute bottom-0 left-0 right-0 z-30 flex bg-white/90 backdrop-blur-md border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          aria-selected={mobileTab === "chat"}
          aria-controls="chat-panel"
          onClick={() => setMobileTab("chat")}
          className={`flex-1 flex flex-col items-center py-3.5 min-h-[44px] text-[11px] font-medium transition ${
            mobileTab === "chat"
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px bg-violet-50/50"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <MessageSquare size={18} className="mb-0.5" />
          Chat
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "canvas"}
          aria-controls="canvas-panel"
          onClick={() => setMobileTab("canvas")}
          className={`flex-1 flex flex-col items-center py-3.5 min-h-[44px] text-[11px] font-medium transition ${
            mobileTab === "canvas"
              ? "text-violet-600 border-t-2 border-violet-600 -mt-px bg-violet-50/50"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
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
            onPracticeCards={handleStartPractice}
          />
        </Suspense>
      )}

      {topicExplorerOpen && (
        <Suspense fallback={null}>
          <TopicExplorerModal
            open={topicExplorerOpen}
            onClose={() => setTopicExplorerOpen(false)}
            onSelectTopic={handleSelectTopic}
          />
        </Suspense>
      )}

      {practiceModalOpen && (
        <Suspense fallback={null}>
          <FlashcardPracticeModal
            open={practiceModalOpen}
            onClose={() => setPracticeModalOpen(false)}
            items={practiceItems}
            onFinish={() => {
              toast.success("Great job! Spaced repetition intervals updated.", { icon: <Trophy size={14} className="text-violet-600" /> });
            }}
          />
        </Suspense>
      )}

      {authModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            open={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
            onLoginWithGoogle={loginWithGoogle}
            onLoginWithPassword={loginWithPassword}
            onSignUpWithPassword={signUpWithPassword}
            onRequestPasswordReset={requestPasswordReset}
          />
        </Suspense>
      )}

      {sessionDrawerOpen && (
        <Suspense fallback={null}>
          <SessionDrawer
            open={sessionDrawerOpen}
            onClose={() => setSessionDrawerOpen(false)}
            sessions={sessions}
            activeSessionId={activeSessionId}
            conflictData={conflictData}
            onOpenSession={openSession}
            onCreateNewSession={() => createNewSession(INITIAL_NODE)}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
            onResolveConflictReload={resolveConflictReload}
            onResolveConflictSaveCopy={resolveConflictSaveCopy}
          />
        </Suspense>
      )}
    </div>
  );
}
