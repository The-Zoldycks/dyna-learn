import { useState, useMemo } from "react";
import { Compass, X, Search, ArrowRight, BookOpen, Layers, Shield, Network, Brain } from "lucide-react";
import { TOPIC_STARTERS } from "../data/topics.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

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
  const modalRef = useFocusTrap(open);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-surface rounded-3xl shadow-2xl border border-line overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-line shrink-0 bg-surface-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent-text flex items-center justify-center shadow-xs">
              <Compass size={20} />
            </div>
            <div>
              <h2 id="topic-explorer-title" className="text-base font-bold text-fg leading-tight">
                Topic Starters
              </h2>
              <p className="text-xs text-fg-muted">Pick a curriculum template to jumpstart interactive learning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close topic starters"
            className="p-2 text-fg-subtle hover:text-fg hover:bg-surface-3 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 pt-4 pb-3 border-b border-line space-y-3 bg-surface shrink-0">
          {/* Search input */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics, concepts, architectures..."
              className="w-full pl-9 pr-8 py-2 bg-surface-2 border border-line rounded-xl text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
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
                    ? "bg-accent text-accent-fg shadow-xs"
                    : "bg-surface-3 text-fg-muted hover:bg-surface-3"
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
            <div className="text-center py-12 bg-surface-2 border border-line rounded-2xl p-6">
              <Compass size={28} className="mx-auto text-fg-subtle mb-2" />
              <p className="text-sm font-semibold text-fg">No topics match "{searchQuery}"</p>
              <p className="text-xs text-fg-muted mt-1">Try another search term or pick a different category.</p>
              <button
                onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}
                className="mt-4 px-4 py-2 bg-surface border border-line text-xs font-medium text-fg rounded-xl hover:bg-surface-3 transition shadow-sm"
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
                    className="flex flex-col justify-between p-4 rounded-2xl border border-line bg-surface hover:border-accent-line hover:shadow-md transition-all group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent-text bg-accent-soft border border-accent-line px-2 py-0.5 rounded-md">
                          {topic.badge}
                        </span>
                        <span className="text-[10px] text-fg-muted font-medium">
                          {topic.nodes.length} nodes
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-fg group-hover:text-fg transition flex items-center gap-1.5 mb-1.5">
                        <IconComponent size={14} className="text-accent-text shrink-0" />
                        <span>{topic.title}</span>
                      </h3>
                      <p className="text-xs text-fg-muted leading-relaxed line-clamp-2">
                        {topic.description}
                      </p>
                    </div>

                    <button
                      onClick={() => onSelectTopic(topic)}
                      className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 bg-accent hover:brightness-110 text-accent-fg text-xs font-semibold rounded-xl transition shadow-sm"
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
