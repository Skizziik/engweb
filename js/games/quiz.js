/**
 * Quiz mode — the fast one. Always English -> Russian: show the English word
 * (+ optional picture + audio), four Russian options, pick one, instant
 * right/wrong feedback, then straight to the next word. No "flip", no rating.
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
  const started = Date.now();

  const visual = el('div.visual.visual-sm');
  if (settings.images || word.emoji) renderVisual(visual, word, { allowPhoto: settings.images });

  const correctText = word.ru[0];
  const options = shuffle([correctText, ...distractors(word, 3)]);

  const grid = el('div.choice-grid');
  const buttons = [];
  let answered = false;

  for (const opt of options) {
    const b = el('button.choice-opt', { text: opt, onclick: () => pick(opt, b) });
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
    const elapsed = Date.now() - started;
    const grade = !correct ? Grade.AGAIN : elapsed < 2500 ? Grade.EASY : Grade.GOOD;
    // instant next: short pause on hit (just to register the green), longer on miss
    setTimeout(() => onResult({ grade, correct }), correct ? 420 : 1050);
  }

  const keyHandler = (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0 && buttons[i]) { e.preventDefault(); buttons[i].click(); }
  };
  window.addEventListener('keydown', keyHandler);
  function teardown() { window.removeEventListener('keydown', keyHandler); }
  ctx.cleanup = teardown;

  const card = el('div.card.choice.quiz', {}, [
    el('div.choice-prompt', {}, [
      visual,
      el('div.choice-q', {}, [
        el('h1.choice-word', { text: word.en }),
        audioButton(() => pronounce(word.en, info?.audio)),
      ]),
      info?.ipa ? el('div.choice-ipa', { text: info.ipa }) : null,
    ]),
    grid,
  ]);
  container.appendChild(card);
  if (settings.autoAudio) setTimeout(() => pronounce(word.en, info?.audio), 120);
}
