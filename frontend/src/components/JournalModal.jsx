import { useState, useEffect } from "react";
import { X, Flame, BookOpen, Clock, Play, Trash2, ArrowRight, BarChart3, Search, RotateCw, Cloud, CloudOff } from "lucide-react";
import { getStreak, getSnapshots, deleteSnapshot } from "../utils/storage";
import { getStats } from "../utils/analytics";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

export default function JournalModal({
  open,
  onClose,
  onLoadSnapshot,
  onStartReview,
  onPracticeCards,
  // New props from useSRS — already resolved (cloud or local)
  user = null,
  dueReviews = null,       // if provided, use this instead of reading localStorage
  onRefreshQueue = null,
}) {
  const [streak, setStreak] = useState(() => getStreak());
  const [snapshots, setSnapshots] = useState(() => getSnapshots());

  // Use prop-provided dueReviews (from useSRS) if available, otherwise fall back to local
  const resolvedDueReviews = dueReviews ?? [];

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [stats, setStats] = useState(() => getStats());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const modalRef = useFocusTrap(open);

  // Refresh stats/streak/snapshots each time the journal opens (they change while it is closed)
  useEffect(() => {
    if (open) {
      try {
        setStreak(getStreak());
        setStats(getStats());
        setSnapshots(getSnapshots());
        onRefreshQueue?.();
      } catch {}
    }
    // onRefreshQueue is stable; refresh intentionally on open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const query = searchQuery.trim().toLowerCase();
  const filteredSnapshots = snapshots.filter((s) => !query || s.title?.toLowerCase().includes(query));
  const filteredReviews = resolvedDueReviews.filter((r) => !query || r.label?.toLowerCase().includes(query));
  const hasNoResults = query && filteredSnapshots.length === 0 && filteredReviews.length === 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Learning journal"
        className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2">
          <div className="flex items-center gap-2 text-fg font-semibold">
            <BookOpen size={18} className="text-accent-text" aria-hidden="true" />
            Learning Journal
          </div>
          <div className="flex items-center gap-2">
            {/* Cloud sync badge */}
            {user ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-success-fg bg-success-soft border border-success-line px-2 py-0.5 rounded-full">
                <Cloud size={10} /> Cloud synced
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-fg-muted bg-surface-3 border border-line px-2 py-0.5 rounded-full" title="Sign in to sync flashcards across devices">
                <CloudOff size={10} /> Local only
              </span>
            )}
            <button onClick={onClose} aria-label="Close learning journal" className="p-1.5 rounded-full hover:bg-surface-hover text-fg-muted transition min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 border-b border-line bg-surface-2 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved lessons or concepts…"
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-line bg-surface placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex gap-1 bg-surface-3 p-1 rounded-xl shrink-0 text-[11px] font-medium text-fg-muted">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "all" ? "bg-surface text-fg shadow-sm" : "hover:text-fg"}`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("lessons")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "lessons" ? "bg-surface text-fg shadow-sm" : "hover:text-fg"}`}
            >
              Lessons ({filteredSnapshots.length})
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "reviews" ? "bg-surface text-fg shadow-sm" : "hover:text-fg"}`}
            >
              Reviews ({filteredReviews.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Stats Row */}
          {!searchQuery && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-warn-soft border border-warn-line rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-warn-soft flex items-center justify-center text-warn-fg">
                  <Flame size={20} className={streak > 0 ? "fill-warn-fg" : ""} />
                </div>
                <div>
                  <p className="text-xs font-medium text-warn-fg uppercase tracking-wide">Daily Streak</p>
                  <p className="text-2xl font-bold text-warn-fg">{streak} {streak === 1 ? "Day" : "Days"}</p>
                </div>
              </div>
              
              <div className="bg-accent-soft border border-accent-line rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center text-accent-text">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-accent-text uppercase tracking-wide">Reviews Due</p>
                  <p className="text-2xl font-bold text-accent-text">{resolvedDueReviews.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Learning activity (on-device analytics) */}
          {!searchQuery && stats && stats.total > 0 && (
            <div className="bg-surface-2 border border-line rounded-xl p-4">
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <BarChart3 size={12} /> Learning activity
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                {[
                  ["Questions", stats.questions],
                  ["Quizzes", stats.quizzes],
                  ["Passed", stats.quizzesPassed],
                  ["Shares", stats.shares],
                  ["Exports", stats.exports],
                ].map(([label, value]) => (
                  <div key={label} className="bg-surface border border-line rounded-lg py-2">
                    <p className="text-lg font-bold text-fg">{value}</p>
                    <p className="text-[10px] text-fg-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Empty State */}
          {hasNoResults && (
            <div className="text-center py-12 bg-surface-2 border border-line rounded-2xl p-6">
              <Search size={28} className="mx-auto text-fg-subtle mb-2" />
              <p className="text-sm font-semibold text-fg">No matches found for "{searchQuery}"</p>
              <p className="text-xs text-fg-muted mt-1">Try searching for a different keyword or topic.</p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-4 px-4 py-2 bg-surface border border-line text-xs font-medium text-fg rounded-xl hover:bg-surface-3 transition shadow-sm"
              >
                Clear search
              </button>
            </div>
          )}

          {/* SRS Due Reviews */}
          {(activeTab === "all" || activeTab === "reviews") && filteredReviews.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-text" />
                  Concepts to Review ({filteredReviews.length})
                  {user && onRefreshQueue && (
                    <button
                      onClick={onRefreshQueue}
                      title="Refresh from cloud"
                      className="ml-1 p-0.5 rounded text-fg-subtle hover:text-accent-text transition"
                    >
                      <RotateCw size={11} />
                    </button>
                  )}
                </h3>
                {onPracticeCards && (
                  <button
                    onClick={() => onPracticeCards(filteredReviews)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-accent hover:brightness-110 text-accent-fg rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    <RotateCw size={12} /> Practice Cards ({filteredReviews.length})
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {filteredReviews.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface shadow-sm hover:border-accent-line transition">
                    <div>
                      <p className="text-sm font-medium text-fg">{item.label}</p>
                      <p className="text-[10px] text-fg-muted">Spaced repetition queue</p>
                    </div>
                    <button
                      onClick={() => onStartReview(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-soft text-accent-text hover:bg-accent-soft text-xs font-medium rounded-md transition"
                    >
                      <Play size={12} /> Quiz Me
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews empty state */}
          {(activeTab === "reviews") && filteredReviews.length === 0 && !searchQuery && (
            <p className="text-xs text-fg-muted italic bg-surface-2 border border-line p-4 rounded-lg">
              {user
                ? "No reviews due yet. Keep learning and the AI will schedule concepts for you automatically!"
                : "No reviews due. Ask the tutor questions and highlighted concepts will appear here."}
            </p>
          )}

          {/* Saved Snapshots (guest only — logged-in users have the Sessions drawer) */}
          {(activeTab === "all" || activeTab === "lessons") && (
            <div>
              <h3 className="text-sm font-semibold text-fg mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-line-strong" />
                {user ? "Locally Saved Lessons" : `Saved Lessons (${filteredSnapshots.length})`}
                {user && (
                  <span className="text-[10px] font-normal text-fg-subtle ml-1">
                    — Cloud sessions are in the Sessions drawer (top right)
                  </span>
                )}
              </h3>
              {filteredSnapshots.length === 0 ? (
                !searchQuery && (
                  <p className="text-xs text-fg-muted italic bg-surface-2 border border-line p-4 rounded-lg">
                    {user
                      ? "No local snapshots. Your sessions are saved to the cloud — open the Sessions drawer to access them."
                      : "No saved lessons yet. Click \"Save\" in the top header to capture a canvas snapshot."}
                  </p>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredSnapshots.map((snap) => (
                    <div key={snap.id} className="flex flex-col p-3 rounded-xl border border-line bg-surface shadow-sm group">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-fg truncate pr-2" title={snap.title}>
                          {snap.title}
                        </p>
                        {confirmDeleteId === snap.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-fg-muted hover:text-fg px-2 py-0.5 border rounded">Cancel</button>
                            <button onClick={() => { deleteSnapshot(snap.id); setSnapshots(getSnapshots()); setConfirmDeleteId(null); }} className="text-[10px] text-app bg-danger-fg hover:brightness-110 px-2 py-0.5 rounded">Confirm</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(snap.id)}
                            aria-label={`Delete saved lesson ${snap.title}`}
                            className="text-fg-subtle hover:text-danger-fg transition focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-fg-muted mb-3">
                        {new Date(snap.date).toLocaleDateString()} · {snap.nodes?.length || 0} nodes
                      </p>
                      <button
                        onClick={() => onLoadSnapshot(snap)}
                        className="mt-auto flex items-center justify-center gap-1.5 w-full py-1.5 bg-surface-3 hover:bg-surface-3 text-fg text-xs font-medium rounded-md transition"
                      >
                        Load Canvas <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
