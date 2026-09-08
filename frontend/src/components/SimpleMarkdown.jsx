/**
 * SimpleMarkdown — lightweight inline markdown renderer (zero external deps).
 * Handles: **bold**, `code`, and \n line breaks.
 * Used for AI tutor speech_text in chat bubbles and the Explanation Drawer.
 */
export default function SimpleMarkdown({ text, className = "" }) {
  if (!text) return null;

  // Split on newlines; each line is parsed for inline tokens
  const lines = text.split("\n");

  return (
    <div className={`break-words ${className}`}>
      {lines.map((line, lineIdx) => {
        const isListItem = /^[-*]\s/.test(line.trimStart());
        const content = parseInline(isListItem ? line.replace(/^[\s\-*]+/, "") : line);

        if (isListItem) {
          return (
            <div key={lineIdx} className="flex items-start gap-1.5 mt-0.5">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-50" />
              <span>{content}</span>
            </div>
          );
        }

        return (
          <span key={lineIdx}>
            {content}
            {lineIdx < lines.length - 1 && "\n"}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Parse a single line into React elements with bold and inline-code support.
 */
function parseInline(text) {
  // Matches **bold** or `code`
  const pattern = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Plain text before this token
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="bg-slate-100 rounded px-1 py-0.5 text-[11px] font-mono text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
