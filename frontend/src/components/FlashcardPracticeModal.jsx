import { useState, useEffect, useCallback, useRef } from "react";
import { X, RotateCw, CheckCircle2, Sparkles, BookOpen, ArrowRight } from "lucide-react";
import { updateSRSItem } from "../utils/storage.js";

function FlashcardPracticeContent({ onClose, items = [], onFinish, onScore }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState({ again: 0, good: 0, easy: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const modalRef = useRef(null);

  const currentCard = items[currentIndex];

  const handleScore = useCallback((rating) => {
    if (!currentCard) return;

    // Update SRS item — cloud-aware when onScore is provided, local fallback otherwise.
    // Pass the full rating so easy earns bonus ease.
    if (currentCard.id) {
      if (onScore) onScore(currentCard.id, rating);
      else updateSRSItem(currentCard.id, rating !== "again");
    }

    setStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));

    if (currentIndex + 1 < items.length) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsComplete(true);
      onFinish?.();
    }
  }, [currentCard, currentIndex, items.length, onFinish, onScore]);

  // Keyboard navigation: Space to flip, 1/2/3 to score, Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (isComplete) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === "1") handleScore("again");
        else if (e.key === "2") handleScore("good");
        else if (e.key === "3") handleScore("easy");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, isComplete, handleScore, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="flashcard-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <BookOpen size={16} />
            </div>
            <div>
              <h2 id="flashcard-modal-title" className="text-sm font-bold text-slate-900">
                Spaced Repetition Flashcards
              </h2>
              {!isComplete && items.length > 0 && (
                <p className="text-[11px] text-slate-500 font-medium">
                  Card {currentIndex + 1} of {items.length}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close flashcards"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress bar */}
        {!isComplete && items.length > 0 && (
          <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
            <div
              className="bg-violet-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${(currentIndex / Math.max(1, items.length)) * 100}%` }}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[360px]">
          {isComplete ? (
            /* Completion Screen */
            <div className="text-center py-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Session Complete!</h3>
              <p className="text-xs text-slate-500 max-w-[260px] mx-auto mb-6">
                You drilled {items.length} concept{items.length > 1 ? "s" : ""}. Review intervals have been rescheduled using the SM-2 algorithm.
              </p>

              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto mb-6">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-xs font-bold text-red-600">{stats.again}</span>
                  <span className="text-[10px] text-slate-500">Again</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-xs font-bold text-violet-600">{stats.good}</span>
                  <span className="text-[10px] text-slate-500">Good</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-xs font-bold text-emerald-600">{stats.easy}</span>
                  <span className="text-[10px] text-slate-500">Easy</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                Back to Journal
              </button>
            </div>
          ) : !currentCard ? (
            <div className="text-center py-10">
              <Sparkles size={28} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-800">No cards due for review</p>
              <p className="text-xs text-slate-500 mt-1">All concepts are up to date. Keep learning!</p>
            </div>
          ) : (
            /* Interactive 3D Flip Card */
            <div className="w-full flex flex-col items-center">
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                tabIndex={0}
                role="button"
                aria-label={`Flashcard: ${currentCard.label}. Click or press space to flip.`}
                className="w-full h-64 cursor-pointer select-none rounded-2xl border border-slate-200 bg-white hover:border-violet-300 hover:shadow-lg transition-all p-6 flex flex-col items-center justify-between text-center relative group"
                style={{
                  perspective: "1000px",
                }}
              >
                {/* Flip badge indicator */}
                <div className="w-full flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span className="uppercase tracking-wider text-[10px] text-violet-600 font-bold bg-violet-50 px-2 py-0.5 rounded-md">
                    {isFlipped ? "Answer / Context" : "Prompt / Concept"}
                  </span>
                  <span className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
                    <RotateCw size={12} /> Flip (Space)
                  </span>
                </div>

                {/* Card Body */}
                <div className="flex-1 flex flex-col items-center justify-center my-auto">
                  {!isFlipped ? (
                    <div>
                      <p className="text-lg font-bold text-slate-900 leading-snug">
                        {currentCard.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 font-medium">
                        Can you recall how this concept works?
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-w-sm">
                      <p className="text-base font-bold text-violet-950 leading-snug">
                        {currentCard.label}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {currentCard.context || "Core architectural concept. Test your memory by rating your recall ease below."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer Cue */}
                <div className="text-[10px] text-slate-400">
                  {!isFlipped ? "Tap card to flip" : "Choose recall quality below"}
                </div>
              </div>

              {/* Assessment Action Buttons (visible once flipped) */}
              <div className="w-full mt-5">
                {isFlipped ? (
                  <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <button
                      onClick={() => handleScore("again")}
                      className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-red-200 bg-red-50/60 hover:bg-red-100/80 text-red-700 transition font-medium text-xs group"
                    >
                      <span className="font-bold">Again (1)</span>
                      <span className="text-[10px] text-red-500 opacity-80">&lt; 1 day</span>
                    </button>
                    <button
                      onClick={() => handleScore("good")}
                      className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-violet-200 bg-violet-50/60 hover:bg-violet-100/80 text-violet-700 transition font-medium text-xs group"
                    >
                      <span className="font-bold">Good (2)</span>
                      <span className="text-[10px] text-violet-500 opacity-80">Progress</span>
                    </button>
                    <button
                      onClick={() => handleScore("easy")}
                      className="flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-700 transition font-medium text-xs group"
                    >
                      <span className="font-bold">Easy (3)</span>
                      <span className="text-[10px] text-emerald-500 opacity-80">Mastered</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsFlipped(true)}
                    className="w-full py-2.5 bg-slate-900 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    Show Answer <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlashcardPracticeModal({ open, onClose, items = [], onFinish, onScore }) {
  if (!open) return null;
  return (
    <FlashcardPracticeContent
      key={items.map((i) => i.id).join(",") || "empty"}
      onClose={onClose}
      items={items}
      onFinish={onFinish}
      onScore={onScore}
    />
  );
}
