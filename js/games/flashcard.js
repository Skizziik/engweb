/**
 * Flashcard mode. Shows the English word + picture; you try to recall the
 * meaning, flip, then self-rate (Again / Hard / Good / Easy). This is the
 * canonical FSRS interaction and the way brand-new words are introduced.
 */
import { el, clear, audioButton } from '../ui.js';
import { renderVisual } from '../images.js';
import { pronounce, speak } from '../audio.js';
import { previewIntervals, fmtInterval, Grade } from '../srs.js';
import { getCard, getSettings } from '../state.js';

const GRADE_BTNS = [
  { g: Grade.AGAIN, label: 'Не помню', cls: 'again', key: '1' },
  { g: Grade.HARD, label: 'Трудно', cls: 'hard', key: '2' },
  { g: Grade.GOOD, label: 'Помню', cls: 'good', key: '3' },
  { g: Grade.EASY, label: 'Легко', cls: 'easy', key: '4' },
];

export function render(container, ctx) {
  const { word, info, isNew, onResult } = ctx;
  clear(container);
  const settings = getSettings();

  const visual = el('div.visual');
  renderVisual(visual, word, { allowPhoto: settings.images });

  const card = el('div.card.flashcard');
  const front = el('div.fc-front', {}, [
    isNew ? el('div.badge.new-badge', { text: '✦ Новое слово' }) : null,
    visual,
    el('div.fc-word-row', {}, [
      el('h1.fc-word', { text: word.en }),
      audioButton(() => pronounce(word.en, info?.audio)),
    ]),
    info?.ipa ? el('div.fc-ipa', { text: info.ipa }) : el('div.fc-ipa.muted', { text: word.posRu }),
  ]);

  const back = el('div.fc-back.hidden');
  const actions = el('div.fc-actions');

  function reveal() {
    front.appendChild(el('div.fc-divider'));
    back.classList.remove('hidden');
    back.innerHTML = '';
    back.appendChild(el('div.fc-translation', { text: word.ru.join(', ') }));
    if (word.posRu) back.appendChild(el('div.fc-pos', { text: word.posRu }));
    if (info?.example) {
      back.appendChild(el('div.fc-example', { html: highlight(info.example, word.en) }));
    } else if (info?.definition) {
      back.appendChild(el('div.fc-example.muted', { text: info.definition }));
    }

    const prev = previewIntervals(getCard(word.id) || ctx.cardRecord, settings.retention);
    clear(actions);
    for (const b of GRADE_BTNS) {
      actions.appendChild(
        el(`button.grade-btn.${b.cls}`, { onclick: () => onResult({ grade: b.g, correct: b.g !== Grade.AGAIN }) }, [
          el('span.grade-label', { text: b.label }),
          el('span.grade-ivl', { text: b.g === Grade.AGAIN ? '<1д' : fmtInterval(prev[b.g]) }),
        ])
      );
    }
    bindKeys();
    if (settings.autoAudio) setTimeout(() => pronounce(word.en, info?.audio), 120);
  }

  const showBtn = el('button.btn.primary.show-btn', { text: 'Показать ответ', onclick: reveal });
  actions.appendChild(showBtn);

  let keyHandler;
  function bindKeys() {
    teardown();
    keyHandler = (e) => {
      const b = GRADE_BTNS.find((x) => x.key === e.key);
      if (b) { e.preventDefault(); onResult({ grade: b.g, correct: b.g !== Grade.AGAIN }); }
    };
    window.addEventListener('keydown', keyHandler);
  }
  function teardown() { if (keyHandler) window.removeEventListener('keydown', keyHandler); }
  ctx.cleanup = teardown;

  // space / enter to reveal
  const revealKey = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && back.classList.contains('hidden')) {
      e.preventDefault(); window.removeEventListener('keydown', revealKey); reveal();
    }
  };
  window.addEventListener('keydown', revealKey);
  const prevCleanup = ctx.cleanup;
  ctx.cleanup = () => { window.removeEventListener('keydown', revealKey); teardown(); };

  card.append(front, back, actions);
  container.appendChild(card);
  if (settings.autoAudio && isNew) setTimeout(() => pronounce(word.en, info?.audio), 200);
}

function highlight(sentence, word) {
  const re = new RegExp(`\\b(${word}\\w*)\\b`, 'ig');
  return `«${sentence.replace(re, '<b>$1</b>')}»`;
}
