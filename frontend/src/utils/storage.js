// dyna-learn storage & retention engine (Zero-dependency)

const SNAPSHOTS_KEY = "dyna-snapshots";
const SRS_KEY = "dyna-srs";
const STREAK_KEY = "dyna-streak";

// ── Streak Engine ────────────────────────────────────────────────────────
export function updateStreakOnLoad() {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"streak":0,"lastDate":null}');
    const today = new Date().toDateString();
    
    if (data.lastDate === today) return data.streak; // Already logged today
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isConsecutive = data.lastDate === yesterday.toDateString();
    const newStreak = isConsecutive ? data.streak + 1 : 1;
    
    localStorage.setItem(STREAK_KEY, JSON.stringify({ streak: newStreak, lastDate: today }));
    return newStreak;
  } catch (err) {
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
  try {
    const snaps = getSnapshots();
    // Strip large base64 images from chatHistory to prevent hitting 5MB localStorage limit
    const cleanHistory = chatHistory.map(turn => {
      if (!turn.image) return turn;
      const { image, ...rest } = turn;
      return rest;
    });

    const newSnap = {
      id: "snap_" + Date.now(),
      title,
      date: new Date().toISOString(),
      nodes,
      edges,
      chatHistory: cleanHistory
    };
    // Keep max 20 snapshots to avoid quota limits
    const updated = [newSnap, ...snaps].slice(0, 20);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
    return newSnap;
  } catch (err) {
    console.error("Failed to save snapshot", err);
    throw new Error("Failed to save snapshot (Storage full?)");
  }
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
