/**
 * Persistent state: per-card SRS records, user settings, daily stats,
 * XP / levels / streak. Everything lives in localStorage under one key so
 * it's trivial to export / import / wipe.
 */
import { newCard } from './srs.js';

const KEY = 'engweb.v1';
const DEFAULT_PIXABAY_KEY = '22396239-c033ce1f67c9aec4d126cd2da';

const defaultState = () => ({
  cards: {},            // wordId -> srs card record
  settings: {
    newPerDay: 15,
    retention: 0.9,
    pixabayKey: DEFAULT_PIXABAY_KEY,
    images: true,
    autoAudio: true,
    levels: ['A1', 'A2', 'B1', 'B2', 'C1'], // which levels to draw new words from
    theme: 'dark',
  },
  stats: {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    lastStudyDay: null,   // YYYY-MM-DD
    reviewsTotal: 0,
    correctTotal: 0,
    days: {},             // 'YYYY-MM-DD' -> { reviews, correct, newLearned }
  },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      cards: parsed.cards || {},
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
    };
  } catch {
    return defaultState();
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }, 120);
}

export function getState() { return state; }
export function getSettings() { return state.settings; }
export function getStats() { return state.stats; }

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

export function getCard(wordId) {
  return state.cards[wordId] || null;
}

export function setCard(wordId, card) {
  state.cards[wordId] = card;
  save();
}

export function ensureCard(wordId) {
  if (!state.cards[wordId]) state.cards[wordId] = newCard();
  return state.cards[wordId];
}

/** Local date string YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStat(day = today()) {
  if (!state.stats.days[day]) {
    state.stats.days[day] = { reviews: 0, correct: 0, newLearned: 0 };
  }
  return state.stats.days[day];
}

/** XP curve: level N needs 50 * N^1.6 cumulative-ish. Returns {level, into, need, pct}. */
export function levelInfo(xp = state.stats.xp) {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level += 1; need = Math.round(100 * Math.pow(level, 1.4)); }
  const into = xp - acc;
  return { level, into, need, pct: Math.round((into / need) * 100) };
}

/** Update the daily streak based on last study day. Call once per study action. */
function bumpStreak() {
  const t = today();
  const last = state.stats.lastStudyDay;
  if (last === t) return;
  if (last) {
    const diff = Math.round((new Date(t) - new Date(last)) / 86400000);
    state.stats.streak = diff === 1 ? state.stats.streak + 1 : 1;
  } else {
    state.stats.streak = 1;
  }
  state.stats.lastStudyDay = t;
  state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
}

/**
 * Record the outcome of one review and award XP.
 * @returns {number} xp gained
 */
export function recordReview({ correct, grade, isNew }) {
  bumpStreak();
  const d = dayStat();
  d.reviews += 1;
  state.stats.reviewsTotal += 1;
  if (correct) { d.correct += 1; state.stats.correctTotal += 1; }
  if (isNew) d.newLearned += 1;

  let xp = 0;
  if (correct) {
    xp = grade === 4 ? 12 : grade === 3 ? 10 : 6; // easy/good/hard
    if (isNew) xp += 5;
    // streak multiplier, capped
    xp = Math.round(xp * Math.min(1 + state.stats.streak * 0.05, 2));
  } else {
    xp = 2; // still reward the attempt
  }
  state.stats.xp += xp;
  save();
  return xp;
}

export function newLearnedToday() {
  return dayStat().newLearned;
}

export function exportState() {
  return JSON.stringify(state, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  state = {
    cards: parsed.cards || {},
    settings: { ...defaultState().settings, ...(parsed.settings || {}) },
    stats: { ...defaultState().stats, ...(parsed.stats || {}) },
  };
  save();
}

export function resetAll() {
  state = defaultState();
  save();
}
