import {
  ClipboardList, Palette, Code2, Bug, Rocket, Wrench,
  Database, Server, Cloud, Lock, FileText, User, Layers,
  Cog, Shield, BookOpen, Lightbulb, Network, Cpu, Brain, Sparkles
} from "lucide-react";
import { Handle, Position, NodeToolbar } from "@xyflow/react";

const iconMap = {
  clipboard: ClipboardList,
  palette: Palette,
  code: Code2,
  bug: Bug,
  rocket: Rocket,
  wrench: Wrench,
  database: Database,
  server: Server,
  cloud: Cloud,
  lock: Lock,
  file: FileText,
  user: User,
  layers: Layers,
  cog: Cog,
  shield: Shield,
  book: BookOpen,
  lightbulb: Lightbulb,
  network: Network,
  cpu: Cpu,
  brain: Brain,
};

// Preset shapes: rectangle (default), pill (start/end), diamond (decision), circle (state)
export default function CustomNode({ data, selected }) {
  const Icon = iconMap[data.icon] || BookOpen;
  const isHighlighted = data.highlight === true;
  const shape = data.shape || "rectangle";

  const base = "relative flex items-center gap-3 px-4 py-3 min-w-[160px] max-w-[220px] text-sm font-medium transition-all duration-300 ease-out";

  const variants = {
    rectangle: "rounded-2xl",
    pill: "rounded-full px-5",
    diamond: "rounded-2xl", // Removed literal diamond clip-path, opting for sleek rounded squares for everything
    circle: "rounded-full w-[130px] h-[130px] justify-center flex-col gap-1.5",
  };

  const stateStyle = isHighlighted
    ? "bg-white border border-rose-300 text-rose-800 shadow-[0_4px_24px_rgba(244,63,94,0.2)] ring-4 ring-rose-500/20 animate-[pulse_3s_ease-in-out_infinite]"
    : selected
    ? "bg-white border border-violet-400 text-violet-900 shadow-lg ring-4 ring-violet-500/10 scale-[1.02]"
    : "bg-white/90 backdrop-blur-md border border-slate-200/80 text-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5";

  // Diamond clip path feels outdated in a modern spatial UI, we ignore shape=diamond and just use rounded-2xl
  const diamondStyle = {};

  return (
    <div
      className={`${base} ${variants[shape] || variants.rectangle} ${stateStyle}`}
      style={diamondStyle}
      title={isHighlighted ? "Highlighted — student confusion detected. Review this concept." : undefined}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} className="mb-2">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('ask-node', { detail: data.label }));
          }}
          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg shadow-lg text-[11px] font-medium hover:bg-slate-800 flex items-center gap-1.5 transition-all"
        >
          <Sparkles size={12} className="text-violet-300" /> Ask about this
        </button>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2 !border-none !-top-1 transition-colors" style={{ background: isHighlighted ? "#fb7185" : selected ? "#8b5cf6" : "#cbd5e1" }} />
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isHighlighted ? "bg-rose-100/80" : selected ? "bg-violet-100/80" : "bg-slate-100"}`}>
        <Icon size={16} className={isHighlighted ? "text-rose-600" : selected ? "text-violet-600" : "text-slate-600"} strokeWidth={2.5} />
      </div>
      <span className="flex-1 leading-snug text-[13px] tracking-tight whitespace-pre-wrap break-words">{data.label}</span>
      {isHighlighted && <span role="status" aria-label="Highlighted for review" className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2 !border-none !-bottom-1 transition-colors" style={{ background: isHighlighted ? "#fb7185" : selected ? "#8b5cf6" : "#cbd5e1" }} />
    </div>
  );
}
