import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

// Custom voice dropdown — replaces the native <select> whose popup list is
// OS-rendered (uncontrollable width + unstyled scrollbar). This listbox is
// constrained to the container width with a theme-colored scrollbar.
export default function VoiceSelect({ edgeVoices, browserVoices, selectedVoice, setSelectedVoice }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const groups = [
    {
      label: "Neural — Edge (online)",
      options: edgeVoices.length
        ? edgeVoices.map((v) => ({ value: v.id, label: v.label }))
        : [{ value: "en-US-AriaNeural", label: "Aria — Warm female (US) — loading…" }],
    },
    {
      label: "Offline / Standard",
      options: browserVoices.length
        ? browserVoices.map((v) => ({ value: v.name, label: `${v.name} — ${v.lang}` }))
        : [{ value: "", label: "Default system voice" }],
    },
  ];
  const flat = groups.flatMap((g) => g.options);
  const selectedLabel = flat.find((o) => o.value === selectedVoice)?.label || selectedVoice || "Choose a voice";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open ]);

  // Keep keyboard-active option in view
  useEffect(() => {
    if (open && activeIndex >= 0) {
      listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  const choose = useCallback((value) => {
    setSelectedVoice(value);
    setOpen(false);
    setActiveIndex(-1);
  }, [setSelectedVoice]);

  const toggle = () => {
    if (!open) {
      const sel = flat.findIndex((o) => o.value === selectedVoice);
      setActiveIndex(sel >= 0 ? sel : 0);
    }
    setOpen((v) => !v);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggle();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0 && flat[activeIndex]) {
      e.preventDefault();
      choose(flat[activeIndex].value);
    }
  };

  let idx = -1;
  return (
    <div ref={rootRef} className="relative mt-1 w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose a narration voice"
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-left focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[44px]"
      >
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Narration voices"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="themed-scroll absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {groups.map((g) => (
            <div key={g.label}>
              <div className="sticky top-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50">
                {g.label}
              </div>
              {g.options.map((o) => {
                idx += 1;
                const myIdx = idx;
                const selected = o.value === selectedVoice;
                return (
                  <button
                    key={`${g.label}-${o.value}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-idx={myIdx}
                    onClick={() => choose(o.value)}
                    onMouseEnter={() => setActiveIndex(myIdx)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition min-h-[36px] ${
                      myIdx === activeIndex ? "bg-violet-50" : ""
                    } ${selected ? "text-violet-800 font-semibold" : "text-slate-700"}`}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {selected && <Check size={13} className="shrink-0 text-violet-600" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
