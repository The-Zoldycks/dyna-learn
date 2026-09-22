import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../utils/supabaseClient";
import { getSnapshots, deleteSnapshot as deleteLocalSnapshot } from "../utils/storage";
import { toast } from "sonner";

const ACTIVE_SESSION_STORAGE_KEY = "dyna_active_session_id";
const OFFLINE_QUEUE_KEY = "dyna_offline_sessions_queue";

export function useSessions({ user, nodes, edges, chatHistory, onRestoreSession }) {
  const isConfigured = isSupabaseConfigured() && Boolean(user);
  const [sessions, setSessions] = useState(() => {
    if (!isSupabaseConfigured() || !user) {
      const localSnaps = getSnapshots();
      return localSnaps.map((s) => ({
        id: s.id,
        title: s.title || "Untitled Lesson",
        nodes: s.nodes || [],
        edges: s.edges || [],
        chat_history: s.chatHistory || [],
        version: 1,
        updated_at: s.date || new Date().toISOString(),
      }));
    }
    return [];
  });
  const [activeSessionId, setActiveSessionId] = useState(
    () => localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || null
  );
  const [activeSessionVersion, setActiveSessionVersion] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [conflictData, setConflictData] = useState(null);

  const idleSaveTimerRef = useRef(null);
  const latestStateRef = useRef({ nodes, edges, chatHistory });
  const migrationDoneRef = useRef(false);

  useEffect(() => {
    latestStateRef.current = { nodes, edges, chatHistory };
  }, [nodes, edges, chatHistory]);

  // Clean chatHistory to strip bulky base64 data URLs before sending to Postgres
  const sanitizeChat = useCallback((chat = []) => {
    return chat.map((turn) => {
      if (!turn.image) return turn;
      const { image: _image, ...rest } = turn;
      return rest;
    });
  }, []);

  // ── Load Sessions ─────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!isConfigured) {
      const localSnaps = getSnapshots();
      const mapped = localSnaps.map((s) => ({
        id: s.id,
        title: s.title || "Untitled Lesson",
        nodes: s.nodes || [],
        edges: s.edges || [],
        chat_history: s.chatHistory || [],
        version: 1,
        updated_at: s.date || new Date().toISOString(),
      }));
      setSessions(mapped);
      return mapped;
    }

    try {
      const { data, error } = await supabase
        .from("study_sessions")
        .select("id, title, version, created_at, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
      return data || [];
    } catch (err) {
      console.warn("Failed to fetch sessions from cloud:", err);
      return [];
    }
  }, [isConfigured]);

  // ── Guest to Cloud Background Migration ──────────────────────────────────
  useEffect(() => {
    if (!isConfigured || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    const localSnaps = getSnapshots();
    if (!localSnaps.length) return;

    // Migrate in background without blocking UI
    (async () => {
      let migratedCount = 0;
      for (const snap of localSnaps) {
        try {
          await supabase.from("study_sessions").insert({
            user_id: user.id,
            title: snap.title || "Migrated Lesson",
            nodes: snap.nodes || [],
            edges: snap.edges || [],
            chat_history: sanitizeChat(snap.chatHistory || []),
            version: 1,
          });
          deleteLocalSnapshot(snap.id);
          migratedCount++;
        } catch (err) {
          console.warn("Failed to migrate snapshot:", err);
        }
      }

      if (migratedCount > 0) {
        toast.success(`Synced ${migratedCount} saved lesson${migratedCount === 1 ? "" : "s"} to your account!`);
        fetchSessions();
      }
    })();
  }, [isConfigured, user, sanitizeChat, fetchSessions]);

  // Initial load
  useEffect(() => {
    if (!isConfigured) return;
    let mounted = true;
    supabase
      .from("study_sessions")
      .select("id, title, version, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!mounted || error || !data) return;
        setSessions(data);
      });
    return () => {
      mounted = false;
    };
  }, [isConfigured]);

  // ── Save Session (Cloud with OCC or Local) ─────────────────────────────────
  const saveSession = useCallback(
    async ({ id = activeSessionId, title, nodes: n, edges: e, chatHistory: c, isManual = false }) => {
      const targetNodes = n || latestStateRef.current.nodes;
      const targetEdges = e || latestStateRef.current.edges;
      const targetChat = sanitizeChat(c || latestStateRef.current.chatHistory);

      if (!targetNodes.length) return null;
      setIsSaving(true);

      // Offline handling: queue locally if internet is down
      if (!navigator.onLine && isConfigured) {
        try {
          const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
          queue.push({ id, title, nodes: targetNodes, edges: targetEdges, chat_history: targetChat, timestamp: Date.now() });
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
          setLastSavedAt(new Date());
          setIsSaving(false);
          if (isManual) toast.info("Saved locally (offline). Will sync when reconnected.");
          return null;
        } catch {}
      }

      if (!isConfigured) {
        // Local Guest Mode saving handled via storage.js saveSnapshot
        setIsSaving(false);
        setLastSavedAt(new Date());
        return null;
      }

      try {
        if (id) {
          // Update existing with Optimistic Concurrency Control (version checking)
          const { data, error, count: _count } = await supabase
            .from("study_sessions")
            .update({
              title: title || undefined,
              nodes: targetNodes,
              edges: targetEdges,
              chat_history: targetChat,
              version: activeSessionVersion + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("version", activeSessionVersion)
            .select("id, version");

          if (error) {
            throw error;
          }

          // OCC: if 0 rows updated, version mismatch -> conflict
          if (!data || data.length === 0) {
            const { data: latest } = await supabase
              .from("study_sessions")
              .select("*")
              .eq("id", id)
              .single();

            if (latest) {
              setConflictData(latest);
              toast.error("Cloud conflict: this session was modified on another device.");
              setIsSaving(false);
              return null;
            }
            throw new Error("Session not found");
          }

          setActiveSessionVersion((v) => v + 1);
          setLastSavedAt(new Date());
          if (isManual) toast.success("Session saved to cloud!");
          fetchSessions();
          return data;
        } else {
          // Create new session
          const sessionTitle = title || inferSessionTitle(targetNodes, targetChat);
          const { data, error } = await supabase
            .from("study_sessions")
            .insert({
              user_id: user.id,
              title: sessionTitle,
              nodes: targetNodes,
              edges: targetEdges,
              chat_history: targetChat,
              version: 1,
            })
            .select("id")
            .single();

          if (error) throw error;
          const newId = data?.id;
          if (newId) {
            setActiveSessionId(newId);
            localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, newId);
            setActiveSessionVersion(1);
          }
          setLastSavedAt(new Date());
          if (isManual) toast.success(`Saved "${sessionTitle}" to cloud!`);
          fetchSessions();
          return data;
        }
      } catch (err) {
        console.error("Failed to save session:", err);
        if (isManual) toast.error("Failed to save session to cloud.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [activeSessionId, activeSessionVersion, isConfigured, user, sanitizeChat, fetchSessions]
  );

  // ── Switch / Open Session ─────────────────────────────────────────────────
  const openSession = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      if (!isConfigured) {
        const localSnaps = getSnapshots();
        const found = localSnaps.find((s) => s.id === sessionId);
        if (found && onRestoreSession) {
          onRestoreSession({ nodes: found.nodes, edges: found.edges, chatHistory: found.chatHistory || [] });
          setActiveSessionId(sessionId);
          localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
          toast.success(`Loaded "${found.title}"`);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("study_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (error || !data) throw error || new Error("Session not found");

        if (onRestoreSession) {
          onRestoreSession({
            nodes: data.nodes || [],
            edges: data.edges || [],
            chatHistory: data.chat_history || [],
          });
        }
        setActiveSessionId(data.id);
        setActiveSessionVersion(data.version || 1);
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, data.id);
        toast.success(`Loaded "${data.title}"`);
      } catch (err) {
        console.error("Failed to open session:", err);
        toast.error("Failed to load session from cloud.");
      }
    },
    [isConfigured, onRestoreSession]
  );

  // ── Create New Blank Session ──────────────────────────────────────────────
  const createNewSession = useCallback(
    (initialNode) => {
      setActiveSessionId(null);
      setActiveSessionVersion(1);
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      if (onRestoreSession) {
        onRestoreSession({
          nodes: initialNode ? [initialNode] : [],
          edges: [],
          chatHistory: [],
        });
      }
      toast.info("Created new blank session");
    },
    [onRestoreSession]
  );

  // ── Delete Session ────────────────────────────────────────────────────────
  const deleteSession = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      if (!isConfigured) {
        deleteLocalSnapshot(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) setActiveSessionId(null);
        toast.success("Lesson deleted");
        return;
      }

      try {
        const { error } = await supabase.from("study_sessions").delete().eq("id", sessionId);
        if (error) throw error;
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        }
        toast.success("Session deleted from cloud");
      } catch {
        toast.error("Failed to delete session");
      }
    },
    [isConfigured, activeSessionId]
  );

  // ── Rename Session ────────────────────────────────────────────────────────
  const renameSession = useCallback(
    async (sessionId, newTitle) => {
      if (!sessionId || !newTitle.trim()) return;
      if (!isConfigured) {
        const local = getSnapshots();
        const item = local.find((s) => s.id === sessionId);
        if (item) {
          item.title = newTitle.trim();
          localStorage.setItem("dyna-snapshots", JSON.stringify(local));
          setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s)));
          toast.success("Renamed lesson");
        }
        return;
      }

      try {
        const { error } = await supabase
          .from("study_sessions")
          .update({ title: newTitle.trim() })
          .eq("id", sessionId);
        if (error) throw error;
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s)));
        toast.success("Renamed session");
      } catch {
        toast.error("Failed to rename session");
      }
    },
    [isConfigured]
  );

  // ── 25-Second Idle Auto-Save ──────────────────────────────────────────────
  const triggerIdleAutoSave = useCallback(() => {
    if (!isConfigured || !activeSessionId) return;
    if (idleSaveTimerRef.current) clearTimeout(idleSaveTimerRef.current);

    idleSaveTimerRef.current = setTimeout(() => {
      saveSession({ id: activeSessionId });
    }, 25000); // 25s debounce
  }, [isConfigured, activeSessionId, saveSession]);

  // Flush on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isConfigured && activeSessionId) {
        // Beacon or immediate sync attempt
        saveSession({ id: activeSessionId });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isConfigured, activeSessionId, saveSession]);

  // Flush offline queue when returning online
  useEffect(() => {
    const handleOnline = async () => {
      if (!isConfigured) return;
      try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (queue.length > 0) {
          toast.info("Reconnected. Syncing offline changes to cloud...");
          for (const item of queue) {
            if (item.id) {
              await supabase.from("study_sessions").update({
                title: item.title,
                nodes: item.nodes,
                edges: item.edges,
                chat_history: item.chat_history,
                updated_at: new Date().toISOString(),
              }).eq("id", item.id);
            }
          }
          localStorage.removeItem(OFFLINE_QUEUE_KEY);
          toast.success("Cloud sync complete ✓");
          fetchSessions();
        }
      } catch (err) {
        console.warn("Failed to flush offline queue:", err);
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isConfigured, fetchSessions]);

  // Conflict resolvers
  const resolveConflictReload = useCallback(() => {
    if (conflictData && onRestoreSession) {
      onRestoreSession({
        nodes: conflictData.nodes || [],
        edges: conflictData.edges || [],
        chatHistory: conflictData.chat_history || [],
      });
      setActiveSessionVersion(conflictData.version);
      setConflictData(null);
      toast.success("Loaded latest version from cloud");
    }
  }, [conflictData, onRestoreSession]);

  const resolveConflictSaveCopy = useCallback(async () => {
    if (!conflictData) return;
    setConflictData(null);
    await saveSession({
      id: null,
      title: `${conflictData.title} (Device Copy)`,
      isManual: true,
    });
  }, [conflictData, saveSession]);

  // ── Share Session (mark public, return short URL) ─────────────────────────
  const shareSession = useCallback(
    async (sessionId = activeSessionId) => {
      if (!isConfigured || !sessionId) return null;
      try {
        const { error } = await supabase
          .from("study_sessions")
          .update({ is_public: true })
          .eq("id", sessionId);
        if (error) throw error;
        return `${window.location.origin}/?share=${sessionId}`;
      } catch (err) {
        console.error("Failed to make session public:", err);
        return null;
      }
    },
    [isConfigured, activeSessionId]
  );

  // ── Load a Shared Session by UUID (public read — no auth needed) ──────────
  const loadSharedSession = useCallback(
    async (sessionId) => {
      if (!sessionId || !isSupabaseConfigured()) return null;
      try {
        const { data, error } = await supabase
          .from("study_sessions")
          .select("id, title, nodes, edges, chat_history")
          .eq("id", sessionId)
          .single();
        if (error || !data) return null;
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return {
    sessions,
    activeSessionId,
    activeSessionTitle: activeSession?.title || "Current Workspace",
    isSaving,
    lastSavedAt,
    conflictData,
    saveSession,
    openSession,
    createNewSession,
    deleteSession,
    renameSession,
    triggerIdleAutoSave,
    resolveConflictReload,
    resolveConflictSaveCopy,
    refreshSessions: fetchSessions,
    shareSession,
    loadSharedSession,
  };
}


function inferSessionTitle(nodes = [], chat = []) {
  if (chat.length > 0 && chat[0]?.text) {
    const q = chat[0].text.trim().replace(/^explain\s+|^how\s+does\s+/i, "");
    return q.slice(0, 32) + (q.length > 32 ? "…" : "");
  }
  if (nodes.length > 0 && nodes[0]?.data?.label) {
    const l = nodes[0].data.label.split("\n")[0];
    return l.slice(0, 30);
  }
  return "Study Session";
}
