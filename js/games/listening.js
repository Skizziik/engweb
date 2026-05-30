/**
 * Listening mode. We pronounce the word (no text shown) and you type what you
 * hear. Trains the ear + spelling together. Replay is unlimited. Scoring is
 * the same as typing mode.
 */
import { el, clear, normalize, editDistance, audioButton } from '../ui.js';
import { pronounce } from '../audio.js';
import { Grade } from '../srs.js';
import { getSettings } from '../state.js';

export function render(container, ctx) {
  const { word, info, onResult } = ctx;
  clear(container);

  const play = () => pronounce(word.en, info?.audio);

  const bigPlay = el('button.big-audio', { onclick: play, title: 'Прослушать ещё раз' }, [
    el('span', { html: '🔊' }),
  ]);

  const input = el('input.type-input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'off',
    autocorrect: 'off', spellcheck: 'false', placeholder: 'что ты услышал? (по-английски)',
  });
  const feedback = el('div.type-feedback');

  const card = el('div.card.listening', {}, [
    el('div.listen-hint', { text: '🎧 Послушай и запиши слово' }),
    bigPlay,
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
    feedback.innerHTML = `${correct ? '✓' : '✗'} <b>${word.en}</b>${info?.ipa ? ' ' + info.ipa : ''} — ${word.ru.join(', ')}`;
    setTimeout(() => onResult({ grade, correct }), correct ? 1000 : 1800);
  }

  const keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  input.addEventListener('keydown', keyHandler);
  function teardown() { input.removeEventListener('keydown', keyHandler); }
  ctx.cleanup = teardown;

  card.appendChild(el('button.btn.primary', { text: 'Проверить', onclick: submit }));
  container.appendChild(card);
  setTimeout(() => { play(); input.focus(); }, 300);
}
