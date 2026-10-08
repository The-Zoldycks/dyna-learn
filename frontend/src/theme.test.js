import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The app used to carry a dark mode made of `!important` overrides for eight
// Tailwind classes. Everything else leaked through: `bg-white/90` never
// matched `.bg-white`, `text-slate-600` was never remapped (2.04:1 on the
// dark panel, i.e. invisible), and the modals stayed light. These guards
// make that unrepeatable — a colour must come from a token in index.css.

const SRC = join(process.cwd(), "src");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.endsWith(".test.js"));

// Matches a class token, e.g. bg-white, text-slate-700, hover:bg-slate-50.
const BANNED = [
  { re: /\bbg-white(\/[\d]+)?\b/g, why: "use bg-surface" },
  { re: /\bbg-slate-\d+(\/[\d]+)?\b/g, why: "use bg-surface-2 / bg-surface-3" },
  { re: /\btext-slate-\d+\b/g, why: "use text-fg / text-fg-muted / text-fg-subtle" },
  { re: /\bborder-slate-\d+\b/g, why: "use border-line / border-line-strong" },
  { re: /\bbg-violet-\d+\b/g, why: "use bg-accent / bg-accent-soft" },
  { re: /\btext-violet-\d+\b/g, why: "use text-accent-text" },
  { re: /\bborder-violet-\d+\b/g, why: "use border-accent-line" },
  { re: /\b(bg|text|border)-(emerald|green)-\d+\b/g, why: "use the success-* tokens" },
  { re: /\b(bg|text|border)-(amber|orange|yellow)-\d+\b/g, why: "use the warn-* tokens" },
  { re: /\b(bg|text|border)-(red|rose|pink)-\d+\b/g, why: "use the danger-* tokens" },
  { re: /\bfocus:bg-white\b/g, why: "focus:bg-white flashes white in dark mode" },
];

describe("theme tokens", () => {
  it("no component hardcodes a light-only surface or text colour", () => {
    const offenders = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { re, why } of BANNED) {
        for (const m of text.matchAll(re)) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${relative(SRC, file)}:${line} ${m[0]} — ${why}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component reaches for an !important colour override", () => {
    // !important is fine for the reduced-motion blanket (that is the whole
    // point of it) but not for pinning a colour — that was the old dark mode.
    const colourOverride =
      /(background|background-color|color|border|border-color|box-shadow|fill|stroke)\s*:[^;}]*!\s*important/g;
    const offenders = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(colourOverride)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${relative(SRC, file)}:${line} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("index.css", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");

  it("defines the light and dark token blocks", () => {
    expect(css).toMatch(/:root\s*\{[\s\S]*--surface:/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{[\s\S]*--surface:/);
  });

  it("exposes tokens to Tailwind via @theme inline", () => {
    expect(css).toContain("@theme inline");
    // `inline` is what lets the dark block cascade into every utility.
    expect(css).toMatch(/--color-surface:\s*var\(--surface\)/);
  });

  it("keeps the neu layer free of !important", () => {
    const neuBlock = css.slice(css.indexOf(".neu-surface"), css.indexOf("/* ── React Flow"));
    expect(neuBlock).not.toContain("!important");
  });
});

describe("token contrast", () => {
  // Relative luminance per WCAG 2.1.
  function luminance(hex) {
    const m = hex.trim().replace("#", "");
    const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  const css = readFileSync(join(SRC, "index.css"), "utf8");
  function block(selector) {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  }
  const token = (selector, name) => block(selector).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`))?.[1];

  const themes = [
    { name: "light", selector: ":root" },
    { name: "dark", selector: '[data-theme="dark"]' },
  ];

  // Pairs that must clear the 4.5:1 body-text minimum.
  const pairs = [
    ["fg", "surface"],
    ["fg-muted", "surface"],
    ["fg-subtle", "surface"],
    ["fg", "surface-2"],
    ["fg-subtle", "surface-2"],
    ["accent-text", "surface"],
    ["success-fg", "success-soft"],
    ["warn-fg", "warn-soft"],
    ["danger-fg", "danger-soft"],
    ["info-fg", "info-soft"],
  ];

  for (const theme of themes) {
    for (const [fg, bg] of pairs) {
      it(`${theme.name}: ${fg} on ${bg} clears 4.5:1`, () => {
        const a = token(theme.selector, `--${fg}`);
        const b = token(theme.selector, `--${bg}`);
        expect(a, `${theme.name} ${fg} missing`).toBeTruthy();
        expect(b, `${theme.name} ${bg} missing`).toBeTruthy();
        const ratio = contrast(a, b);
        expect(
          ratio,
          `${theme.name} ${fg} (${a}) on ${bg} (${b}) is only ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const theme of themes) {
    it(`${theme.name}: accent-fg on accent clears 4.5:1`, () => {
      const a = token(theme.selector, "--accent-fg");
      const b = token(theme.selector, "--accent");
      const ratio = contrast(a, b);
      expect(ratio, `${theme.name} ${a} on ${b} is only ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});