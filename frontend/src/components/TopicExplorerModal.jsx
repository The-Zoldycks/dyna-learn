import { useState, useMemo, useEffect, useRef } from "react";
import { Compass, X, Search, ArrowRight, BookOpen, Layers, Shield, Network, Brain } from "lucide-react";
import { TOPIC_STARTERS } from "../data/topics.js";

const CATEGORY_ICONS = {
  "Computer Science": BookOpen,
  "System Design": Shield,
  "Web Dev": Layers,
  "AI & Data": Brain,
  "default": Network,
};

export default function TopicExplorerModal({ open, onClose, onSelectTopic }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const modalRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Focus trapping and Esc handling
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  const categories = useMemo(() => {
    const cats = new Set(TOPIC_STARTERS.map((t) => t.category));
    return ["all", ...Array.from(cats)];
  }, []);

  const filteredTopics = useMemo(() => {
    return TOPIC_STARTERS.filter((topic) => {
      const matchesCat = activeCategory === "all" || topic.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q ||
        topic.title.toLowerCase().includes(q) ||
        topic.description.toLowerCase().includes(q) ||
        topic.badge.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeCategory, searchQuery]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="topic-explorer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shadow-xs">
              <Compass size={20} />
            </div>
            <div>
              <h2 id="topic-explorer-title" className="text-base font-bold text-slate-900 leading-tight">
                Topic Starters
              </h2>
              <p className="text-xs text-slate-500">Pick a curriculum template to jumpstart interactive learning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close topic starters"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 space-y-3 bg-white shrink-0">
          {/* Search input */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics, concepts, architectures..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  activeCategory === cat
                    ? "bg-violet-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat === "all" ? "All Topics" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Topic Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredTopics.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 border border-slate-200/80 rounded-2xl p-6">
              <Compass size={28} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-800">No topics match "{searchQuery}"</p>
              <p className="text-xs text-slate-500 mt-1">Try another search term or pick a different category.</p>
              <button
                onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}
                className="mt-4 px-4 py-2 bg-white border border-slate-200 text-xs font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition shadow-sm"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredTopics.map((topic) => {
                const IconComponent = CATEGORY_ICONS[topic.category] || CATEGORY_ICONS.default;
                return (
                  <div
                    key={topic.id}
                    className="flex flex-col justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:border-violet-300 hover:shadow-md transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-200/60 px-2 py-0.5 rounded-md">
                          {topic.badge}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {topic.nodes.length} nodes
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-violet-900 transition flex items-center gap-1.5 mb-1.5">
                        <IconComponent size={14} className="text-violet-600 shrink-0" />
                        <span>{topic.title}</span>
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {topic.description}
                      </p>
                    </div>

                    <button
                      onClick={() => onSelectTopic(topic)}
                      className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 bg-slate-900 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition shadow-sm"
                    >
                      Start Lesson <ArrowRight size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
