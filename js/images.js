/**
 * Word imagery. Priority:
 *   1. Real photo from the Pixabay API (needs a free key in settings).
 *   2. The curated emoji from the bundled dataset.
 *   3. A coloured letter-tile placeholder (always works).
 *
 * Pixabay results are cached in localStorage so we don't re-hit the API and
 * so images appear instantly on review.
 */
import { getSettings } from './state.js';

const imgCache = new Map();
const IMG_CACHE_KEY = 'engweb.img.v1';
try {
  const stored = JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}');
  for (const [k, v] of Object.entries(stored)) imgCache.set(k, v);
} catch {}

function persist() {
  try {
    const obj = {};
    for (const [k, v] of imgCache) obj[k] = v;
    localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

/**
 * Resolve a photo URL for a word, or null. Cached. Never throws.
 * Uses the noun/most concrete sense by querying the English word.
 */
export async function photoFor(word) {
  const s = getSettings();
  if (!s.images || !s.pixabayKey) return null;
  if (imgCache.has(word.en)) return imgCache.get(word.en);

  const params = new URLSearchParams({
    key: s.pixabayKey,
    q: word.en,
    image_type: 'photo',
    safesearch: 'true',
    per_page: '3',
    lang: 'en',
    order: 'popular',
  });
  try {
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) { imgCache.set(word.en, null); persist(); return null; }
    const data = await res.json();
    const hit = (data.hits || [])[0];
    const url = hit ? hit.webformatURL : null;
    imgCache.set(word.en, url);
    persist();
    return url;
  } catch {
    return null;
  }
}

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];

/** Deterministic colour for a word (for the letter-tile fallback). */
export function colorFor(word) {
  let h = 0;
  for (let i = 0; i < word.en.length; i++) h = (h * 31 + word.en.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Render the visual for a word into a container element. Shows emoji / letter
 * immediately, then upgrades to a photo if one loads.
 */
export function renderVisual(el, word, { allowPhoto = true } = {}) {
  el.className = 'visual';
  el.style.background = '';
  // immediate fallback
  if (word.emoji) {
    el.innerHTML = `<span class="visual-emoji">${word.emoji}</span>`;
  } else {
    el.style.background = colorFor(word);
    el.innerHTML = `<span class="visual-letter">${word.en[0].toUpperCase()}</span>`;
  }
  if (!allowPhoto) return;
  photoFor(word).then((url) => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      el.style.background = '';
      el.innerHTML = '';
      img.className = 'visual-photo';
      img.alt = word.en;
      el.appendChild(img);
    };
    img.src = url;
  });
}
