/**
 * Multiple-choice mode. Two directions, chosen at random:
 *   en->ru : show the English word (+ picture + audio), pick the Russian meaning
 *   ru->en : show the Russian meaning, pick the English word
 * A fast correct answer earns "Easy"; a normal correct earns "Good";
 * a wrong answer earns "Again" and reveals the right option.
 */
import { el, clear, audioButton } from '../ui.js';
import { renderVisual } from '../images.js';
import { pronounce } from '../audio.js';
import { Grade } from '../srs.js';
import { distractors, shuffle } from '../data.js';
import { getSettings } from '../state.js';

export function render(container, ctx) {
  const { word, info, onResult } = ctx;
  clear(container);
  const settings = getSettings();
  const dir = Math.random() < 0.5 ? 'en2ru' : 'ru2en';
  const started = Date.now();

  const card = el('div.card.choice');
  const prompt = el('div.choice-prompt');

  let correctText, options;
  if (dir === 'en2ru') {
    const visual = el('div.visual.visual-sm');
    renderVisual(visual, word, { allowPhoto: settings.images });
    prompt.append(
      visual,
      el('div.choice-q', {}, [
        el('h1.choice-word', { text: word.en }),
        audioButton(() => pronounce(word.en, info?.audio)),
      ]),
      el('div.choice-hint', { text: 'Выбери перевод' })
    );
    correctText = word.ru[0];
    options = shuffle([correctText, ...distractors(word, 3)]);
    if (settings.autoAudio) setTimeout(() => pronounce(word.en, info?.audio), 150);
  } else {
    prompt.append(
      el('h1.choice-word.ru', { text: word.ru.join(', ') }),
      word.posRu ? el('div.choice-hint', { text: word.posRu + ' · выбери английское слово' }) : el('div.choice-hint', { text: 'Выбери английское слово' })
    );
    correctText = word.en;
    // distractors: english words of same POS
    const others = englishDistractors(word, 3);
    options = shuffle([correctText, ...others]);
  }

  const grid = el('div.choice-grid');
  let answered = false;
  const buttons = [];
  for (const opt of options) {
    const b = el('button.choice-opt', {
      text: opt,
      onclick: () => pick(opt, b),
    });
    buttons.push(b);
    grid.appendChild(b);
  }

  function pick(opt, btn) {
    if (answered) return;
    answered = true;
    teardown();
    const correct = opt === correctText;
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.textContent === correctText) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
    if (dir === 'ru2en') setTimeout(() => pronounce(word.en, info?.audio), 80);
    const elapsed = Date.now() - started;
    let grade;
    if (!correct) grade = Grade.AGAIN;
    else grade = elapsed < 3500 ? Grade.EASY : Grade.GOOD;
    setTimeout(() => onResult({ grade, correct }), correct ? 650 : 1100);
  }

  // number keys 1-4
  const keyHandler = (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0 && buttons[i]) { e.preventDefault(); buttons[i].click(); }
  };
  window.addEventListener('keydown', keyHandler);
  function teardown() { window.removeEventListener('keydown', keyHandler); }
  ctx.cleanup = teardown;

  card.append(prompt, grid);
  container.appendChild(card);
}

function englishDistractors(word, n) {
  // plausible wrong answers: nearby-frequency words of the same part of speech
  const out = [];
  const used = new Set([word.en]);
  // pull nearby-rank same-POS words deterministically-ish
  let r = word.rank;
  let guard = 0;
  while (out.length < n && guard < 400) {
    guard++;
    r += guard % 2 === 0 ? guard : -guard;
    const cand = findByRankPos(r, word.pos);
    if (cand && !used.has(cand.en)) { used.add(cand.en); out.push(cand.en); }
  }
  return out;
}

// lightweight neighbour lookup without importing WORDS array directly
import { WORDS } from '../data.words.js';
const byRank = new Map(WORDS.map((w) => [w.rank, w]));
function findByRankPos(rank, pos) {
  for (let d = 0; d < 50; d++) {
    const a = byRank.get(rank + d);
    if (a && a.pos === pos) return a;
    const b = byRank.get(rank - d);
    if (b && b.pos === pos) return b;
  }
  return byRank.get(rank);
}
