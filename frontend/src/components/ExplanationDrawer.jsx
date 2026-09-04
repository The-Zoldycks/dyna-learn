import { X, Volume2, Pause, Play, Square, Sparkles } from "lucide-react";

export default function ExplanationDrawer({
  open,
  speechText,
  onClose,
  onReplay,
  onPause,
  onResume,
  onStop,
  isSpeaking,
  isPaused,
}) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] z-20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="absolute right-0 top-0 h-full w-[560px] max-w-[90%] bg-white shadow-2xl z-30 flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white">
              <Sparkles size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-none">Tutor Explanation</h3>
              <p className="text-xs text-slate-500">{isSpeaking ? (isPaused ? "Paused" : "Speaking...") : "Ready to replay"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Audio controls */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
          {!isSpeaking ? (
            <button
              onClick={onReplay}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition"
            >
              <Volume2 size={14} /> Replay
            </button>
          ) : isPaused ? (
            <>
              <button onClick={onResume} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-medium hover:bg-violet-700">
                <Play size={12} /> Resume
              </button>
              <button onClick={onStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs hover:bg-slate-100">
                <Square size={12} /> Stop
              </button>
            </>
          ) : (
            <>
              <button onClick={onPause} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-medium hover:bg-violet-700">
                <Pause size={12} /> Pause
              </button>
              <button onClick={onStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs hover:bg-slate-100">
                <Square size={12} /> Stop
              </button>
              <span className="ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-600">Playing</span>
            </>
          )}
          <span className="ml-auto text-xs text-slate-400">{speechText?.length || 0} chars</span>
        </div>

        {/* Content - wide measure, scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <article className="prose prose-sm max-w-none prose-slate">
            <p className="text-[15px] leading-7 text-slate-800 whitespace-pre-wrap break-words">
              {speechText || "No explanation yet. Ask a question to generate one."}
            </p>
          </article>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-500">Drawer overlay — canvas stays visible underneath</p>
          <button onClick={onClose} className="text-xs font-medium text-violet-600 hover:text-violet-700">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
