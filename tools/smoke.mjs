// Headless smoke test: render every screen and simulate a study round in jsdom.
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!DOCTYPE html><html><head></head><body><header id="topbar"></header><main id="app"></main></body></html>`,
  { url: 'http://localhost/', pretendToBeVisual: true }
);
const { window } = dom;
// minimal browser shims the app touches (jsdom already provides localStorage)
const def = (obj, k, v) => Object.defineProperty(obj, k, { value: v, writable: true, configurable: true });
def(window, 'speechSynthesis', { getVoices: () => [], speak() {}, cancel() {}, set onvoiceschanged(_) {} });
def(window, 'SpeechSynthesisUtterance', class {});
def(window, 'Audio', class { play() { return Promise.resolve(); } pause() {} });
def(window, 'scrollTo', () => {});
def(window, 'requestAnimationFrame', (cb) => setTimeout(cb, 0));
def(window, 'fetch', async () => ({ ok: false, status: 503, json: async () => ([]), text: async () => '' }));
def(window, 'confirm', () => false);
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

for (const k of ['window', 'document', 'localStorage', 'speechSynthesis', 'SpeechSynthesisUtterance', 'Audio', 'fetch', 'navigator', 'requestAnimationFrame', 'confirm']) {
  def(globalThis, k, window[k]);
}

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? '✓' : '✗ FAIL'} ${name}`); if (!cond) failures++; };

window.addEventListener('error', (e) => { console.error('window error:', e.error?.message || e.message); failures++; });

await import('../js/app.js');
const W = window.WordOwl;

await new Promise((r) => setTimeout(r, 50));
ok('home renders', document.querySelector('.home') && document.querySelectorAll('.mode-card').length === 6);

W.go('stats');
ok('stats renders', document.querySelector('.stats') && document.querySelectorAll('.big-stat').length === 6);
ok('14-day chart', document.querySelectorAll('.bar-col').length === 14);

W.go('browse');
ok('browse renders rows', document.querySelectorAll('.browse-row').length > 0);

W.go('settings');
ok('settings renders', document.querySelectorAll('.setting-row').length >= 4);
ok('level chips', document.querySelectorAll('.level-toggle .chip').length === 5);

W.go('study');
await new Promise((r) => setTimeout(r, 120)); // wait for enrich() to settle
const hasCard = document.querySelector('.flashcard, .choice, .typing, .listening');
ok('study renders a card', !!hasCard);

// simulate answering 6 cards by clicking the first available action
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 60));
  const show = document.querySelector('.show-btn');
  if (show) { show.click(); await new Promise((r) => setTimeout(r, 20)); }
  const action = document.querySelector('.grade-btn.good, .choice-opt, .type-input');
  if (action) {
    if (action.classList.contains('type-input')) {
      action.value = 'test';
      const ev = new window.KeyboardEvent('keydown', { key: 'Enter' });
      action.dispatchEvent(ev);
    } else {
      action.click();
    }
  }
}
await new Promise((r) => setTimeout(r, 80));
const stats = W.state.getStats();
ok('reviews recorded', stats.reviewsTotal > 0);
ok('xp awarded', stats.xp > 0);
ok('cards persisted', Object.keys(W.state.getState().cards).length > 0);

console.log(`\n${failures === 0 ? 'ALL PASS ✅' : failures + ' FAILURE(S) ❌'}`);
process.exit(failures ? 1 : 0);
