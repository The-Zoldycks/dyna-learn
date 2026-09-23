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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Learning journal"
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <BookOpen size={18} className="text-violet-600" aria-hidden="true" />
            Learning Journal
          </div>
          <div className="flex items-center gap-2">
            {/* Cloud sync badge */}
            {user ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Cloud size={10} /> Cloud synced
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full" title="Sign in to sync flashcards across devices">
                <CloudOff size={10} /> Local only
              </span>
            )}
            <button onClick={onClose} aria-label="Close learning journal" className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200/80 bg-slate-50/30 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved lessons or concepts…"
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0 text-[11px] font-medium text-slate-600">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "all" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("lessons")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "lessons" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
            >
              Lessons ({filteredSnapshots.length})
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`px-3 py-1 rounded-lg transition ${activeTab === "reviews" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
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
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                  <Flame size={20} className={streak > 0 ? "fill-orange-500" : ""} />
                </div>
                <div>
                  <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Daily Streak</p>
                  <p className="text-2xl font-bold text-orange-700">{streak} {streak === 1 ? "Day" : "Days"}</p>
                </div>
              </div>
              
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-violet-600 uppercase tracking-wide">Reviews Due</p>
                  <p className="text-2xl font-bold text-violet-700">{resolvedDueReviews.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Learning activity (on-device analytics) */}
          {!searchQuery && stats && stats.total > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
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
                  <div key={label} className="bg-white border border-slate-200 rounded-lg py-2">
                    <p className="text-lg font-bold text-slate-800">{value}</p>
                    <p className="text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Empty State */}
          {hasNoResults && (
            <div className="text-center py-12 bg-slate-50 border border-slate-200/80 rounded-2xl p-6">
              <Search size={28} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-800">No matches found for "{searchQuery}"</p>
              <p className="text-xs text-slate-500 mt-1">Try searching for a different keyword or topic.</p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-4 px-4 py-2 bg-white border border-slate-200 text-xs font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition shadow-sm"
              >
                Clear search
              </button>
            </div>
          )}

          {/* SRS Due Reviews */}
          {(activeTab === "all" || activeTab === "reviews") && filteredReviews.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  Concepts to Review ({filteredReviews.length})
                  {user && onRefreshQueue && (
                    <button
                      onClick={onRefreshQueue}
                      title="Refresh from cloud"
                      className="ml-1 p-0.5 rounded text-slate-400 hover:text-violet-600 transition"
                    >
                      <RotateCw size={11} />
                    </button>
                  )}
                </h3>
                {onPracticeCards && (
                  <button
                    onClick={() => onPracticeCards(filteredReviews)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    <RotateCw size={12} /> Practice Cards ({filteredReviews.length})
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {filteredReviews.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-violet-300 transition">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      <p className="text-[10px] text-slate-500">Spaced repetition queue</p>
                    </div>
                    <button
                      onClick={() => onStartReview(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 hover:bg-violet-200 text-xs font-medium rounded-md transition"
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
            <p className="text-xs text-slate-500 italic bg-slate-50 border border-slate-100 p-4 rounded-lg">
              {user
                ? "No reviews due yet. Keep learning and the AI will schedule concepts for you automatically!"
                : "No reviews due. Ask the tutor questions and highlighted concepts will appear here."}
            </p>
          )}

          {/* Saved Snapshots (guest only — logged-in users have the Sessions drawer) */}
          {(activeTab === "all" || activeTab === "lessons") && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                {user ? "Locally Saved Lessons" : `Saved Lessons (${filteredSnapshots.length})`}
                {user && (
                  <span className="text-[10px] font-normal text-slate-400 ml-1">
                    — Cloud sessions are in the Sessions drawer (top right)
                  </span>
                )}
              </h3>
              {filteredSnapshots.length === 0 ? (
                !searchQuery && (
                  <p className="text-xs text-slate-500 italic bg-slate-50 border border-slate-100 p-4 rounded-lg">
                    {user
                      ? "No local snapshots. Your sessions are saved to the cloud — open the Sessions drawer to access them."
                      : "No saved lessons yet. Click \"Save\" in the top header to capture a canvas snapshot."}
                  </p>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredSnapshots.map((snap) => (
                    <div key={snap.id} className="flex flex-col p-3 rounded-xl border border-slate-200 bg-white shadow-sm group">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-slate-800 truncate pr-2" title={snap.title}>
                          {snap.title}
                        </p>
                        {confirmDeleteId === snap.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-slate-500 hover:text-slate-800 px-2 py-0.5 border rounded">Cancel</button>
                            <button onClick={() => { deleteSnapshot(snap.id); setSnapshots(getSnapshots()); setConfirmDeleteId(null); }} className="text-[10px] text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded">Confirm</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(snap.id)}
                            aria-label={`Delete saved lesson ${snap.title}`}
                            className="text-slate-400 hover:text-red-600 transition focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mb-3">
                        {new Date(snap.date).toLocaleDateString()} · {snap.nodes?.length || 0} nodes
                      </p>
                      <button
                        onClick={() => onLoadSnapshot(snap)}
                        className="mt-auto flex items-center justify-center gap-1.5 w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition"
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
