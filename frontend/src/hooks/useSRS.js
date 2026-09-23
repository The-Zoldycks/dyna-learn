import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../utils/supabaseClient";
import {
  getSRSQueue,
  logHighlightToSRS as logLocal,
  updateSRSItem as updateLocal,
} from "../utils/storage";
import { toast } from "sonner";

/**
 * useSRS — Spaced Repetition System hook.
 *
 * For guests:   reads/writes from localStorage (dyna-srs).
 * For logged-in users: reads/writes from Supabase public.srs_cards.
 *
 * On first login, migrates any existing local cards to Supabase automatically.
 */
export function useSRS({ user }) {
  const isConfigured = isSupabaseConfigured() && Boolean(user);
  const [queue, setQueue] = useState([]);
  const migrationDoneRef = useRef(false);

  // ── Map Supabase row → local shape ──────────────────────────────────────
  const fromRow = (row) => ({
    id: row.id,
    nodeId: row.node_id,
    label: row.label,
    interval: row.interval_days ?? 0,
    ease: row.ease_factor ?? 2.5,
    repetitions: row.repetitions ?? 0,
    nextReview: row.next_review_at ? new Date(row.next_review_at).getTime() : Date.now(),
    addedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  });

  // ── Load queue ──────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!isConfigured) {
      setQueue(getSRSQueue());
      return;
    }
    try {
      const { data, error } = await supabase
        .from("srs_cards")
        .select("*")
        .eq("user_id", user.id)
        .order("next_review_at", { ascending: true });
      if (error) throw error;
      setQueue((data || []).map(fromRow));
    } catch (err) {
      console.warn("useSRS: failed to fetch SRS cards", err);
      // Fall back to local
      setQueue(getSRSQueue());
    }
  }, [isConfigured, user]);

  // Initial load
  // Intentional sync of external store (Supabase/localStorage) into state
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ── Migrate local cards on first login ──────────────────────────────────
  useEffect(() => {
    if (!isConfigured || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    const localCards = getSRSQueue();
    if (!localCards.length) return;

    (async () => {
      const migratedIds = new Set();
      for (const card of localCards) {
        try {
          const { error } = await supabase.from("srs_cards").insert({
            user_id: user.id,
            node_id: card.nodeId,
            label: card.label,
            interval_days: card.interval ?? 0,
            ease_factor: card.ease ?? 2.5,
            repetitions: 0,
            next_review_at: new Date(card.nextReview).toISOString(),
          });
          if (error) throw error;
          migratedIds.add(card.id);
        } catch {
          // Duplicate or failed — keep the card locally, don't wipe it below
        }
      }
      if (migratedIds.size > 0) {
        // Remove only successfully migrated cards; keep failures locally
        try {
          const remaining = getSRSQueue().filter((c) => !migratedIds.has(c.id));
          if (remaining.length) localStorage.setItem("dyna-srs", JSON.stringify(remaining));
          else localStorage.removeItem("dyna-srs");
        } catch {}
        toast.success(
          `Synced ${migratedIds.size} flashcard${migratedIds.size === 1 ? "" : "s"} to your account!`,
          { duration: 4000 }
        );
        fetchQueue();
      }
    })();
  }, [isConfigured, user, fetchQueue]);

  // ── Log a concept (confusion detected by AI) ───────────────────────────
  const logCard = useCallback(
    async (nodeId, label) => {
      if (!label || label === nodeId) return;

      if (!isConfigured) {
        logLocal(nodeId, label);
        setQueue(getSRSQueue());
        return;
      }

      // Normalize to match local dedup (case-insensitive) and avoid cloud duplicates
      const normLabel = String(label).trim();
      const matchLabel = normLabel.toLowerCase();
      const resetToDue = (id) => supabase
        .from("srs_cards")
        .update({ interval_days: 0, next_review_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);
      try {
        // Check if already tracked for this user (compare case-insensitively)
        const { data: candidates } = await supabase
          .from("srs_cards")
          .select("id, label")
          .eq("user_id", user.id);
        const existing = (candidates || []).find((c) => String(c.label || "").toLowerCase() === matchLabel);

        if (existing) {
          // Confused again → reset interval to 0, due immediately
          await resetToDue(existing.id);
        } else {
          const reviewIn12h = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
          const { error: insertError } = await supabase.from("srs_cards").insert({
            user_id: user.id,
            node_id: nodeId,
            label: normLabel,
            interval_days: 0,
            ease_factor: 2.5,
            repetitions: 0,
            next_review_at: reviewIn12h,
          });
          if (insertError) {
            const isDuplicate = insertError.details?.code === "23505" || /duplicate|unique/i.test(insertError.message || "");
            if (isDuplicate) {
              // Lost the select→insert race — re-fetch and reset the winner
              const { data: winner } = await supabase
                .from("srs_cards")
                .select("id, label")
                .eq("user_id", user.id);
              const match = (winner || []).find((c) => String(c.label || "").toLowerCase() === matchLabel);
              if (match?.id) await resetToDue(match.id);
            } else {
              throw insertError;
            }
          }
        }
        fetchQueue();
      } catch (err) {
        console.warn("useSRS: logCard failed, falling back to local", err);
        logLocal(nodeId, normLabel);
        setQueue(getSRSQueue());
      }
    },
    [isConfigured, user, fetchQueue]
  );

  // ── Update after quiz (SM-2) ────────────────────────────────────────────
  // Accepts boolean passed or "again"/"good"/"easy" rating (easy earns bonus ease).
  const reviewCard = useCallback(
    async (id, passed) => {
      const rating = typeof passed === "string" ? passed : (passed ? "good" : "again");
      const isPass = rating !== "again";
      if (!isConfigured) {
        updateLocal(id, isPass);
        setQueue(getSRSQueue());
        return;
      }

      // Find card in current queue — refetch on miss (stale practiceItems)
      let card = queue.find((c) => c.id === id);
      if (!card) {
        try {
          const { data } = await supabase
            .from("srs_cards")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .single();
          if (data) card = fromRow(data);
        } catch {}
        if (!card) {
          toast.error("Couldn't find that flashcard — reopen the Journal and try again.");
          return;
        }
      }

      let newInterval = card.interval;
      let newEase = card.ease;
      let reps = (card.repetitions ?? 0) + 1;

      if (isPass) {
        if (newInterval === 0) newInterval = 1;
        else if (newInterval === 1) newInterval = 3;
        else newInterval = Math.round(newInterval * newEase);
        if (rating === "easy") newEase = Math.min(3.0, newEase + 0.15);
      } else {
        newInterval = 0;
        newEase = Math.max(1.3, newEase - 0.2);
        reps = 0;
      }

      const nextReviewAt = new Date(
        Date.now() + newInterval * 24 * 3600 * 1000
      ).toISOString();

      try {
        const { error } = await supabase
          .from("srs_cards")
          .update({
            interval_days: newInterval,
            ease_factor: newEase,
            repetitions: reps,
            next_review_at: nextReviewAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        fetchQueue();
      } catch (err) {
        console.warn("useSRS: reviewCard failed, falling back to local", err);
        updateLocal(id, isPass);
        setQueue(getSRSQueue());
      }
    },
    [isConfigured, queue, user, fetchQueue]
  );

  // eslint-disable-next-line react/purity
  const dueReviews = queue.filter((c) => c.nextReview <= Date.now());

  return {
    queue,
    dueReviews,
    logCard,
    reviewCard,
    refreshQueue: fetchQueue,
  };
}
