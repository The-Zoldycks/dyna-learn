// Strip markdown down to the text the user actually sees when it renders,
// so TTS voices read natural speech instead of raw markers ("hash hash", asterisks).
// Mirrors what SimpleMarkdown.jsx renders: headings, quotes, bullets, numbers,
// bold/italic, inline code, code fences — plus links/images as their visible text.
export function stripMarkdown(text) {
  if (text == null) return "";
  let t = String(text);

  // Code fences: drop ```/```lang lines, keep the visible code content
  t = t.replace(/^[ \t]*```[\w+-]*[ \t]*$/gm, "");

  // Horizontal rules (before bullets so "* * *" doesn't partially match)
  t = t.replace(/^[ \t]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/gm, "");

  // ATX headings: "## Title" -> "Title"
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");

  // Blockquote markers
  t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, "");

  // Bullet markers (the renderer shows a dot, not the dash/asterisk)
  t = t.replace(/^[ \t]*[-*+][ \t]+/gm, "");

  // Images and links: keep only the visible text/alt
  t = t.replace(/!\[([^\]]*)\]\([^)\n]*\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)\n]*\)/g, "$1");

  // Inline emphasis + code markers (renderer displays the inner text only)
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  t = t.replace(/`([^`\n]+)`/g, "$1");

  // Tidy blank lines
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}
