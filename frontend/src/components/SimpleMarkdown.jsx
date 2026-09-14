import { useState } from "react";

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-xl bg-slate-900 text-slate-100 p-3 text-xs font-mono overflow-x-auto border border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-1.5 text-[10px] text-slate-400 font-bold tracking-wider">
        <span>{lang ? lang.toUpperCase() : "CODE"}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition font-sans"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre">{code}</pre>
    </div>
  );
}

/**
 * SimpleMarkdown — lightweight full-feature markdown renderer (zero external deps).
 * Handles: code blocks (```), headings (#, ##, ###), blockquotes (>),
 * bullet lists (-/*), numbered lists (1.), bold (**), italic (*), and inline `code`.
 */
export default function SimpleMarkdown({ text, className = "" }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code fence toggle
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <CodeBlock
            key={`code-${i}`}
            code={codeBuffer.join("\n")}
            lang={codeLang}
          />
        );
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Empty line spacer
    if (!trimmed) {
      elements.push(<div key={`blank-${i}`} className="h-1.5" />);
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={`h3-${i}`} className="font-bold text-slate-900 text-sm mt-2.5 mb-1 tracking-tight">
          {parseInline(trimmed.slice(4))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={`h2-${i}`} className="font-bold text-slate-900 text-[15px] mt-3 mb-1 tracking-tight">
          {parseInline(trimmed.slice(3))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={`h1-${i}`} className="font-bold text-slate-900 text-base mt-3.5 mb-1.5 tracking-tight">
          {parseInline(trimmed.slice(2))}
        </h2>
      );
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={`quote-${i}`} className="border-l-2 border-violet-500 pl-3 italic text-slate-600 my-1 text-xs leading-relaxed">
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Numbered list: 1. Item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2 mt-0.5 pl-1 text-[13px] leading-relaxed">
          <span className="shrink-0 font-mono text-[11px] font-bold text-violet-700 pt-0.5">{numMatch[1]}.</span>
          <span className="flex-1">{parseInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Bullet list: - Item or * Item
    if (/^[-*]\s/.test(trimmed)) {
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 mt-0.5 pl-1 text-[13px] leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0 opacity-75" />
          <span className="flex-1">{parseInline(trimmed.replace(/^[-*]\s+/, ""))}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={`p-${i}`} className="mt-0.5 leading-relaxed text-[13px]">
        {parseInline(rawLine)}
      </p>
    );
  }

  // Unclosed code block safety fallback
  if (inCodeBlock && codeBuffer.length) {
    elements.push(
      <CodeBlock
        key="code-unclosed"
        code={codeBuffer.join("\n")}
        lang={codeLang}
      />
    );
  }

  return <div className={`break-words ${className}`}>{elements}</div>;
}

/**
 * Parse a single line into React elements with bold, italic, and inline-code support.
 */
function parseInline(text) {
  // Matches **bold**, *italic*, or `code`
  const pattern = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={key++} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="bg-slate-100 text-violet-700 rounded px-1.5 py-0.5 text-[11px] font-mono border border-slate-200/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
