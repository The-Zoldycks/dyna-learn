import { useState, useEffect } from "react";
import { X, Flame, BookOpen, Clock, Play, Trash2, ArrowRight } from "lucide-react";
import { getStreak, getSnapshots, getDueReviews, deleteSnapshot } from "../utils/storage";

export default function JournalModal({ open, onClose, onLoadSnapshot, onStartReview }) {
  const [streak, setStreak] = useState(0);
  const [snapshots, setSnapshots] = useState([]);
  const [dueReviews, setDueReviews] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (open) {
      setStreak(getStreak());
      setSnapshots(getSnapshots());
      setDueReviews(getDueReviews());
      setConfirmDeleteId(null);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <BookOpen size={18} className="text-violet-600" />
            Learning Journal
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Stats Row */}
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
                <p className="text-2xl font-bold text-violet-700">{dueReviews.length}</p>
              </div>
            </div>
          </div>

          {/* SRS Due Reviews */}
          {dueReviews.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                Concepts to Review
              </h3>
              <div className="space-y-2">
                {dueReviews.map((item) => (
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

          {/* Saved Snapshots */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              Saved Lessons
            </h3>
            {snapshots.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-slate-50 border border-slate-100 p-4 rounded-lg">
                No saved lessons yet. Click "Save" in the top header to capture a canvas snapshot.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {snapshots.map((snap) => (
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
                          className="text-slate-400 hover:text-red-600 transition md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
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

        </div>
      </div>
    </div>
  );
}
