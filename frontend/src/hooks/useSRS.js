import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../utils/supabaseClient";
import {
  getSRSQueue,
  getDueReviews,
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
    nextReview: new Date(row.next_review_at).getTime(),
    addedAt: new Date(row.created_at).getTime(),
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
      let migrated = 0;
      for (const card of localCards) {
        try {
          await supabase.from("srs_cards").insert({
            user_id: user.id,
            node_id: card.nodeId,
            label: card.label,
            interval_days: card.interval ?? 0,
            ease_factor: card.ease ?? 2.5,
            repetitions: 0,
            next_review_at: new Date(card.nextReview).toISOString(),
          });
          migrated++;
        } catch {
          // If a duplicate label exists (unique constraint), just skip
        }
      }
      if (migrated > 0) {
        // Clear local after successful migration
        try { localStorage.removeItem("dyna-srs"); } catch {}
        toast.success(
          `Synced ${migrated} flashcard${migrated === 1 ? "" : "s"} to your account!`,
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

      try {
        // Check if already tracked for this user
        const { data: existing } = await supabase
          .from("srs_cards")
          .select("id, interval_days")
          .eq("user_id", user.id)
          .eq("label", label)
          .single();

        if (existing) {
          // Confused again → reset interval to 0, due immediately
          await supabase
            .from("srs_cards")
            .update({ interval_days: 0, next_review_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          const reviewIn12h = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
          await supabase.from("srs_cards").insert({
            user_id: user.id,
            node_id: nodeId,
            label,
            interval_days: 0,
            ease_factor: 2.5,
            repetitions: 0,
            next_review_at: reviewIn12h,
          });
        }
        fetchQueue();
      } catch (err) {
        console.warn("useSRS: logCard failed, falling back to local", err);
        logLocal(nodeId, label);
      }
    },
    [isConfigured, user, fetchQueue]
  );

  // ── Update after quiz (SM-2) ────────────────────────────────────────────
  const reviewCard = useCallback(
    async (id, passed) => {
      if (!isConfigured) {
        updateLocal(id, passed);
        setQueue(getSRSQueue());
        return;
      }

      // Find card in current queue
      const card = queue.find((c) => c.id === id);
      if (!card) return;

      let newInterval = card.interval;
      let newEase = card.ease;
      let reps = (card.repetitions ?? 0) + 1;

      if (passed) {
        if (newInterval === 0) newInterval = 1;
        else if (newInterval === 1) newInterval = 3;
        else newInterval = Math.round(newInterval * newEase);
      } else {
        newInterval = 0;
        newEase = Math.max(1.3, newEase - 0.2);
        reps = 0;
      }

      const nextReviewAt = new Date(
        Date.now() + newInterval * 24 * 3600 * 1000
      ).toISOString();

      try {
        await supabase
          .from("srs_cards")
          .update({
            interval_days: newInterval,
            ease_factor: newEase,
            repetitions: reps,
            next_review_at: nextReviewAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        fetchQueue();
      } catch (err) {
        console.warn("useSRS: reviewCard failed, falling back to local", err);
        updateLocal(id, passed);
      }
    },
    [isConfigured, queue, fetchQueue]
  );

  const dueReviews = queue.filter((c) => c.nextReview <= Date.now());

  return {
    queue,
    dueReviews,
    logCard,
    reviewCard,
    refreshQueue: fetchQueue,
  };
}
