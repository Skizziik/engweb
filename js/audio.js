/**
 * Pronunciation. Two sources, in order of preference:
 *   1. A real human-recorded audio URL from dictionaryapi.dev (when available).
 *   2. The browser's built-in speech synthesis (Web Speech API) — free,
 *      offline, no key. We pick the best available English voice.
 */
let cachedVoice = null;
let voicesReady = false;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  // Prefer high-quality named voices, then US, then any English.
  const prefer = ['Samantha', 'Google US English', 'Daniel', 'Karen', 'Microsoft'];
  for (const name of prefer) {
    const v = en.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return en.find((v) => /US/i.test(v.lang)) || en[0] || voices[0];
}

if (typeof speechSynthesis !== 'undefined') {
  const init = () => { cachedVoice = pickVoice(); voicesReady = true; };
  speechSynthesis.onvoiceschanged = init;
  init();
}

let currentAudio = null;

/** Speak an English string via the Web Speech API. */
export function speak(text, { rate = 0.92 } = {}) {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  if (!cachedVoice) cachedVoice = pickVoice();
  if (cachedVoice) u.voice = cachedVoice;
  speechSynthesis.speak(u);
}

/**
 * Play the best pronunciation for a word: recorded audio if we have a URL,
 * otherwise speech synthesis. `audioUrl` comes from data.enrich().
 */
export function pronounce(word, audioUrl) {
  if (audioUrl) {
    try {
      if (currentAudio) { currentAudio.pause(); }
      const url = audioUrl.startsWith('//') ? 'https:' + audioUrl : audioUrl;
      currentAudio = new Audio(url);
      currentAudio.play().catch(() => speak(word));
      return;
    } catch {/* fall through */}
  }
  speak(word);
}

export const audioSupported = typeof speechSynthesis !== 'undefined';
