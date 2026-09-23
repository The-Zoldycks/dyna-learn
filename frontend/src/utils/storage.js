// dyna-learn storage & retention engine (Zero-dependency)

const SNAPSHOTS_KEY = "dyna-snapshots";
const SRS_KEY = "dyna-srs";
const STREAK_KEY = "dyna-streak";

// ── Streak Engine (UTC calendar days — immune to midnight/DST/travel) ────
function utcDay(offset = 0) {
  const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function updateStreakOnLoad() {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"streak":0,"lastDate":null}');
    const today = utcDay();

    if (data.lastDate === today) return data.streak; // Already logged today

    const isConsecutive = data.lastDate === utcDay(-1);
    const newStreak = isConsecutive ? data.streak + 1 : 1;

    localStorage.setItem(STREAK_KEY, JSON.stringify({ streak: newStreak, lastDate: today }));
    return newStreak;
  } catch {
    return 1;
  }
}

export function getStreak() {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"streak":0,"lastDate":null}');
    return data.streak;
  } catch { return 0; }
}

// ── Canvas Snapshots ─────────────────────────────────────────────────────
export function getSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
  } catch { return []; }
}

export function saveSnapshot(title, nodes, edges, chatHistory) {
  const snaps = getSnapshots();
  // Strip large base64 images from chatHistory to prevent hitting 5MB localStorage limit
  const cleanHistory = chatHistory.map((turn) => {
    if (!turn.image) return turn;
    const { image: _image, ...rest } = turn;
    return rest;
  });

  const newSnap = {
    id: "snap_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.floor(Math.random() * 1e9)),
    title,
    date: new Date().toISOString(),
    nodes,
    edges,
    chatHistory: cleanHistory,
  };

  let candidates = [newSnap, ...snaps].slice(0, 20);
  let saved = false;

  // Evict oldest snapshot if browser quota is reached
  while (!saved && candidates.length > 0) {
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(candidates));
      saved = true;
    } catch {
      if (candidates.length > 1) {
        candidates.pop(); // drop oldest snapshot to free space
      } else {
        throw new Error("Storage quota exceeded. Please clear some saved lessons.");
      }
    }
  }

  return newSnap;
}

export function deleteSnapshot(id) {
  const snaps = getSnapshots().filter(s => s.id !== id);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snaps));
}

// ── Spaced Repetition System (SM-2) ──────────────────────────────────────
export function getSRSQueue() {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY) || "[]");
  } catch { return []; }
}

export function getDueReviews() {
  const now = Date.now();
  return getSRSQueue().filter(item => item.nextReview <= now);
}

// Log a concept to SRS when the AI highlights it (confusion detected)
export function logHighlightToSRS(nodeId, label) {
  if (!label || label === nodeId) return; // Ignore unlabelled nodes
  
  const queue = getSRSQueue();
  const existingIndex = queue.findIndex(i => i.label.toLowerCase() === label.toLowerCase());
  
  if (existingIndex > -1) {
    // If it's already in the queue and they are confused AGAIN, reset its interval
    queue[existingIndex].interval = 0;
    queue[existingIndex].nextReview = Date.now();
  } else {
    // New concept to review
    queue.push({
      id: "srs_" + Date.now(),
      nodeId,
      label,
      interval: 0, // days
      ease: 2.5,
      nextReview: Date.now() + (12 * 60 * 60 * 1000), // Review in 12 hours
      addedAt: Date.now()
    });
  }
  localStorage.setItem(SRS_KEY, JSON.stringify(queue));
}

// Update the SM-2 item after a quiz
export function updateSRSItem(id, passed) {
  const queue = getSRSQueue();
  const item = queue.find(i => i.id === id);
  if (!item) return;

  if (passed) {
    if (item.interval === 0) item.interval = 1;
    else if (item.interval === 1) item.interval = 3;
    else item.interval = Math.round(item.interval * item.ease);
  } else {
    item.interval = 0;
    item.ease = Math.max(1.3, item.ease - 0.2);
  }

  // Set next review date
  item.nextReview = Date.now() + (item.interval * 24 * 60 * 60 * 1000);
  localStorage.setItem(SRS_KEY, JSON.stringify(queue));
}
