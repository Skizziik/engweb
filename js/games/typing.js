/**
 * Typing (active recall) mode. Shows the Russian meaning (+ picture) and you
 * type the English word. This is the hardest, highest-value drill. We accept
 * a one-character typo (Levenshtein <= 1) as correct-but-Hard. Empty/way-off
 * answers are "Again" and the correct spelling is revealed.
 */
import { el, clear, normalize, editDistance } from '../ui.js';
import { renderVisual } from '../images.js';
import { pronounce } from '../audio.js';
import { Grade } from '../srs.js';
import { getSettings } from '../state.js';

export function render(container, ctx) {
  const { word, info, onResult } = ctx;
  clear(container);
  const settings = getSettings();

  const visual = el('div.visual.visual-sm');
  renderVisual(visual, word, { allowPhoto: settings.images });

  const input = el('input.type-input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'off',
    autocorrect: 'off', spellcheck: 'false', placeholder: 'type in English…',
  });

  const feedback = el('div.type-feedback');
  const card = el('div.card.typing', {}, [
    visual,
    el('div.type-prompt', { text: word.ru.join(', ') }),
    word.posRu ? el('div.choice-hint', { text: word.posRu }) : null,
    input,
    feedback,
  ]);

  let answered = false;
  function submit() {
    if (answered) return;
    const val = normalize(input.value);
    if (!val) return;
    answered = true;
    teardown();
    input.disabled = true;

    const target = normalize(word.en);
    const dist = editDistance(val, target);
    let grade, correct;
    if (val === target) { grade = Grade.GOOD; correct = true; }
    else if (dist <= 1) { grade = Grade.HARD; correct = true; }
    else { grade = Grade.AGAIN; correct = false; }

    input.classList.add(correct ? 'ok' : 'err');
    feedback.className = 'type-feedback ' + (correct ? 'ok' : 'err');
    if (correct) {
      feedback.innerHTML = dist === 0
        ? `✓ <b>${word.en}</b>${info?.ipa ? ' ' + info.ipa : ''}`
        : `почти! правильно: <b>${word.en}</b>`;
    } else {
      feedback.innerHTML = `правильно: <b>${word.en}</b>${info?.ipa ? ' ' + info.ipa : ''}`;
    }
    setTimeout(() => pronounce(word.en, info?.audio), 80);
    setTimeout(() => onResult({ grade, correct }), correct ? 950 : 1700);
  }

  const keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  input.addEventListener('keydown', keyHandler);
  function teardown() { input.removeEventListener('keydown', keyHandler); }
  ctx.cleanup = teardown;

  card.appendChild(el('button.btn.primary', { text: 'Проверить', onclick: submit }));
  container.appendChild(card);
  setTimeout(() => input.focus(), 50);
}
