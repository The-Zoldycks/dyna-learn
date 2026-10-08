import { useSyncExternalStore } from "react";

// Single source of truth for the theme so non-React callers (the pre-paint
// script in index.html mirrors this, and the Toaster in main.jsx reads it)
// don't have to be threaded through App's state.

const KEY = "dyna-theme";
const subs = new Set();

let current = "light";

function systemTheme() {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  return systemTheme();
}

function emit() {
  for (const fn of subs) fn();
}

export function getTheme() {
  return current;
}

export function applyTheme(next) {
  current = next;
  if (typeof document !== "undefined") document.documentElement.dataset.theme = next;
  try {
    if (localStorage.getItem(KEY) !== next) localStorage.setItem(KEY, next);
  } catch {}
  emit();
}

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Reads a live design token so JS-driven colours (React Flow props) match CSS. */
export function readToken(name, fallback = "") {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return v ? v.trim() : fallback;
}

/** Returns [theme, setTheme]. Persisted, cross-tab synced, system-aware. */
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getTheme,
    () => "light"
  );
  return [theme, applyTheme];
}

/**
 * Reads a live design token and re-renders on theme change, for the few
 * places where a colour has to reach a non-CSS API (React Flow's Background
 * and MiniMap take colours as props).
 */
export function useToken(name, fallback = "") {
  useTheme(); // subscribe so switching themes re-resolves the token
  return readToken(name, fallback);
}

// Init once at module load. index.html already sets data-theme before paint;
// this keeps the stored value authoritative and mirrors it across tabs.
if (typeof window !== "undefined") {
  applyTheme(read());
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== KEY) return;
    const next = read();
    if (next === current) return;
    current = next;
    document.documentElement.dataset.theme = next;
    emit();
  });
}