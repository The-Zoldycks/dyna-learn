// dyna-learn local analytics (zero-dependency, privacy-friendly).
// Events stay on-device in localStorage (last 100) — no network, no cookies.

const ANALYTICS_KEY = "dyna-analytics";
const MAX_EVENTS = 100;

export function track(name, props = {}) {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.push({ name, props, at: Date.now() });
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {}
}

export function getStats() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    const count = (name, pred) => events.filter((e) => e.name === name && (!pred || pred(e))).length;
    return {
      questions: count("question_asked"),
      quizzes: count("quiz_completed"),
      quizzesPassed: count("quiz_completed", (e) => e.props?.passed),
      snapshots: count("snapshot_saved"),
      shares: count("lesson_shared"),
      exports: count("diagram_exported"),
      total: events.length,
    };
  } catch {
    return { questions: 0, quizzes: 0, quizzesPassed: 0, snapshots: 0, shares: 0, exports: 0, total: 0 };
  }
}
