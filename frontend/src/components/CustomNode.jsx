import {
  ClipboardList, Palette, Code2, Bug, Rocket, Wrench,
  Database, Server, Cloud, Lock, FileText, User, Layers,
  Cog, Shield, BookOpen, Lightbulb, Network, Cpu, Brain,
} from "lucide-react";
import { Handle, Position } from "@xyflow/react";

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

  const base = "relative flex items-center gap-2.5 px-3.5 py-3 min-w-[150px] max-w-[200px] text-sm font-medium transition-all";

  const variants = {
    rectangle: "rounded-xl",
    pill: "rounded-full px-5",
    diamond: "rounded-lg rotate-0", // diamond via outer rotate, inner counter-rotate if needed
    circle: "rounded-full w-[120px] h-[120px] justify-center flex-col gap-1",
  };

  const stateStyle = isHighlighted
    ? "bg-red-50 border-2 border-red-500 text-red-700 shadow-[0_4px_16px_rgba(239,68,68,0.3)]"
    : selected
    ? "bg-violet-50 border-2 border-violet-600 text-violet-900 shadow-[0_4px_16px_rgba(124,58,237,0.2)]"
    : "bg-white border-2 border-indigo-400 text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] hover:border-indigo-500";

  // Diamond outer wrapper would rotate, but keep simple for now: use chamfer via clip-path alternative
  const diamondStyle = shape === "diamond" ? { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", padding: "18px 12px", minWidth: 140 } : {};

  return (
    <div className={`${base} ${variants[shape] || variants.rectangle} ${stateStyle}`} style={diamondStyle}>
      <Handle type="target" position={Position.Top} style={{ background: isHighlighted ? "#ef4444" : "#6366f1", width: 8, height: 8 }} />
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isHighlighted ? "bg-red-100" : selected ? "bg-violet-100" : "bg-indigo-50"}`}>
        <Icon size={16} className={isHighlighted ? "text-red-600" : selected ? "text-violet-600" : "text-indigo-600"} />
      </div>
      <span className="flex-1 leading-tight text-[13px] text-center whitespace-pre-wrap break-words">{data.label}</span>
      {isHighlighted && <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-white" />}
      <Handle type="source" position={Position.Bottom} style={{ background: isHighlighted ? "#ef4444" : "#6366f1", width: 8, height: 8 }} />
    </div>
  );
}
