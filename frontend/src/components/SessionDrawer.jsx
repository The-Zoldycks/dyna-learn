import { useState } from "react";
import { X, Plus, Search, Trash2, Edit2, Check, Clock, AlertTriangle, ArrowRight, FolderOpen } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

export default function SessionDrawer({
  open,
  onClose,
  sessions = [],
  activeSessionId,
  conflictData,
  onOpenSession,
  onCreateNewSession,
  onRenameSession,
  onDeleteSession,
  onResolveConflictReload,
  onResolveConflictSaveCopy,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const drawerRef = useFocusTrap(open);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const query = searchQuery.trim().toLowerCase();
  const filtered = sessions.filter((s) => !query || s.title?.toLowerCase().includes(query));

  const startRename = (s) => {
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const submitRename = (id) => {
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-end sm:justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-drawer-title"
        className="bg-white w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-right-10 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-violet-600" />
            <h2 id="session-drawer-title" className="text-sm font-bold text-slate-800">
              Study Workspaces
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onCreateNewSession();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus size={13} />
              <span>New Session</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Conflict Alert Banner */}
        {conflictData && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
            <div className="flex items-start gap-2 text-xs font-semibold text-amber-800">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <span>Conflict: "{conflictData.title}" was updated on another device.</span>
            </div>
            <div className="flex gap-2 ml-5">
              <button
                onClick={onResolveConflictReload}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition"
              >
                Load Latest
              </button>
              <button
                onClick={onResolveConflictSaveCopy}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 transition"
              >
                Save as Copy
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces by topic…"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 min-h-[300px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <FolderOpen size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">No workspaces found</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {query ? `No session matching "${searchQuery}"` : "Click '+ New Session' above to begin."}
              </p>
            </div>
          ) : (
            filtered.map((s) => {
              const isActive = s.id === activeSessionId;
              const isEditing = editingId === s.id;
              const isDeleting = confirmDeleteId === s.id;

              return (
                <div
                  key={s.id}
                  className={`group relative flex items-center justify-between p-3.5 rounded-2xl border transition ${
                    isActive
                      ? "border-violet-300 bg-violet-50/50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitRename(s.id)}
                          className="flex-1 px-2 py-1 text-xs font-semibold rounded-lg border border-violet-400 focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => submitRename(s.id)}
                          className="p-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          onOpenSession(s.id);
                          onClose();
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-800 truncate">{s.title}</p>
                          {isActive && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-600 text-white">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                          <Clock size={10} />
                          <span>Updated {formatDate(s.updated_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isEditing && (
                      <button
                        onClick={() => startRename(s)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                        title="Rename workspace"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}

                    {isDeleting ? (
                      <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                        <button
                          onClick={() => {
                            onDeleteSession(s.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] font-bold text-red-600 px-1.5 py-0.5 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-slate-500 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                        title="Delete workspace"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}

                    {!isActive && !isEditing && (
                      <button
                        onClick={() => {
                          onOpenSession(s.id);
                          onClose();
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition ml-1"
                        title="Open workspace"
                      >
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso = "") {
  if (!iso) return "recently";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "recently";
  }
}
