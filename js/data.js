/**
 * Word data access: the bundled list, the study queue (due + new), distractor
 * generation for multiple-choice, and lazy enrichment from the free
 * dictionaryapi.dev (IPA, audio URL, English definition + example).
 */
import { WORDS } from './data.words.js';
import { getCard, getSettings, newLearnedToday, ensureCard } from './state.js';
import { isDue } from './srs.js';

export { WORDS };

const byId = new Map(WORDS.map((w) => [w.id, w]));
export const getWord = (id) => byId.get(id);
export const totalWords = WORDS.length;

/** Words allowed by the user's selected levels. */
function pool() {
  const levels = new Set(getSettings().levels);
  return WORDS.filter((w) => levels.has(w.level));
}

/**
 * Build the study queue for this session.
 *  - all due review cards (already started, due now)
 *  - up to the remaining "new per day" budget of brand-new words (by frequency)
 * Returns an array of word ids in a sensible order (reviews first, then new).
 */
export function buildQueue(now = Date.now()) {
  const settings = getSettings();
  const p = pool();

  const due = [];
  const fresh = [];
  for (const w of p) {
    const card = getCard(w.id);
    if (!card || card.state === 'new') fresh.push(w);
    else if (isDue(card, now)) due.push(w);
  }

  // due: most overdue first
  due.sort((a, b) => new Date(getCard(a.id).due) - new Date(getCard(b.id).due));
  // new: by frequency rank (most useful first)
  fresh.sort((a, b) => a.rank - b.rank);

  const newBudget = Math.max(0, settings.newPerDay - newLearnedToday());
  const newWords = fresh.slice(0, newBudget);

  return { due: due.map((w) => w.id), fresh: newWords.map((w) => w.id) };
}

/** Counts for the dashboard. */
export function queueCounts(now = Date.now()) {
  const q = buildQueue(now);
  return { due: q.due.length, fresh: q.fresh.length, total: q.due.length + q.fresh.length };
}

/** Overall progress across the whole (level-filtered) pool. */
export function progressStats() {
  const p = pool();
  let learning = 0, mastered = 0, seen = 0;
  for (const w of p) {
    const c = getCard(w.id);
    if (!c || c.state === 'new') continue;
    seen += 1;
    if (c.s >= 60) mastered += 1; else learning += 1;
  }
  return { total: p.length, seen, learning, mastered };
}

/**
 * Pick `n` distractor translations for a target word (for multiple choice).
 * Prefer same part-of-speech & nearby frequency so choices feel plausible.
 */
export function distractors(word, n = 3) {
  const samePos = WORDS.filter(
    (w) => w.id !== word.id && w.pos === word.pos && w.ru[0]
  );
  const shuffled = shuffle(samePos.length >= n * 3 ? samePos : WORDS.filter((w) => w.id !== word.id));
  const out = [];
  const used = new Set([word.ru[0]]);
  for (const w of shuffled) {
    const t = w.ru[0];
    if (!used.has(t)) { used.add(t); out.push(t); }
    if (out.length >= n) break;
  }
  return out;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- dictionaryapi.dev enrichment (free, no key) -------------------------
const dictCache = new Map();
const DICT_CACHE_KEY = 'engweb.dict.v1';
try {
  const stored = JSON.parse(localStorage.getItem(DICT_CACHE_KEY) || '{}');
  for (const [k, v] of Object.entries(stored)) dictCache.set(k, v);
} catch {}

function persistDict() {
  try {
    const obj = {};
    for (const [k, v] of dictCache) obj[k] = v;
    localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

/**
 * Fetch IPA, audio URL, and an English example for a word. Cached forever in
 * localStorage. Returns null fields on failure — callers must tolerate that.
 */
export async function enrich(word) {
  const key = word.en;
  if (dictCache.has(key)) return dictCache.get(key);
  const empty = { ipa: null, audio: null, definition: null, example: null };
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (!res.ok) { dictCache.set(key, empty); persistDict(); return empty; }
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) { dictCache.set(key, empty); persistDict(); return empty; }
    const ph = (entry.phonetics || []).find((p) => p.audio) || {};
    let definition = null, example = null;
    for (const m of entry.meanings || []) {
      for (const d of m.definitions || []) {
        if (!definition) definition = d.definition;
        if (!example && d.example) example = d.example;
      }
    }
    const out = {
      ipa: entry.phonetic || (entry.phonetics || []).map((p) => p.text).find(Boolean) || null,
      audio: ph.audio || null,
      definition,
      example,
    };
    dictCache.set(key, out);
    persistDict();
    return out;
  } catch {
    dictCache.set(key, empty);
    return empty;
  }
}

/** Warm the cache for upcoming words without blocking. */
export function prefetch(words) {
  let i = 0;
  const step = () => {
    if (i >= words.length) return;
    enrich(words[i++]).finally(() => setTimeout(step, 150));
  };
  step();
}
