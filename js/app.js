/**
 * App shell: top bar, screen router, and the study-session engine that ties
 * the queue, the FSRS scheduler, the game modes, and gamification together.
 */
import { el, clear, toast, confetti } from './ui.js';
import * as state from './state.js';
import { review, Grade, fmtInterval } from './srs.js';
import {
  WORDS, getWord, totalWords, buildQueue, queueCounts, progressStats, prefetch, enrich,
} from './data.js';
import { renderVisual, photoFor } from './images.js';
import { pronounce } from './audio.js';
import * as Flashcard from './games/flashcard.js';
import * as Choice from './games/choice.js';
import * as Typing from './games/typing.js';
import * as Listening from './games/listening.js';

const app = document.getElementById('app');
const topbar = document.getElementById('topbar');

let session = null; // active study session
let focusMode = 'mix';

// ---------------------------------------------------------------- top bar
function renderTopbar() {
  const s = state.getStats();
  const li = state.levelInfo();
  clear(topbar);
  topbar.appendChild(
    el('div.tb-inner', {}, [
      el('button.brand', { onclick: () => go('home') }, [
        el('span.brand-logo', { html: '🦉' }),
        el('span.brand-name', { text: 'WordOwl' }),
      ]),
      el('div.tb-stats', {}, [
        el('div.tb-stat.streak', { title: 'Серия дней подряд' }, [
          el('span', { html: '🔥' }), el('b', { text: String(s.streak) }),
        ]),
        el('div.tb-level', { title: `Уровень ${li.level} · ${li.into}/${li.need} XP` }, [
          el('div.tb-level-badge', { text: String(li.level) }),
          el('div.tb-xp', {}, [
            el('div.tb-xp-bar', {}, [el('i', { style: { width: li.pct + '%' } })]),
            el('span.tb-xp-text', { text: `${s.xp} XP` }),
          ]),
        ]),
        el('button.icon-btn', { onclick: () => go('settings'), title: 'Настройки' }, [el('span', { html: '⚙️' })]),
      ]),
    ])
  );
}

// ---------------------------------------------------------------- router
function go(screen) {
  if (session && screen !== 'study') session = null;
  renderTopbar();
  clear(app);
  if (screen === 'home') renderHome();
  else if (screen === 'study') startSession();
  else if (screen === 'stats') renderStats();
  else if (screen === 'settings') renderSettings();
  else if (screen === 'browse') renderBrowse();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- home
function renderHome() {
  const counts = queueCounts();
  const prog = progressStats();
  const pct = prog.total ? Math.round((prog.seen / prog.total) * 100) : 0;

  const ring = circularProgress(pct);

  const modes = [
    { id: 'mix', icon: '🧠', label: 'Умный микс', desc: 'Карточки + тесты + ввод + аудио' },
    { id: 'flash', icon: '🃏', label: 'Карточки', desc: 'Вспомни и оцени себя' },
    { id: 'choice', icon: '✅', label: 'Выбор', desc: 'Выбери правильный перевод' },
    { id: 'type', icon: '⌨️', label: 'Ввод', desc: 'Напиши слово по-английски' },
    { id: 'listen', icon: '🎧', label: 'Аудирование', desc: 'Запиши то, что услышал' },
  ];

  app.appendChild(
    el('div.screen.home', {}, [
      el('div.hero', {}, [
        ring,
        el('div.hero-text', {}, [
          el('h2', { text: greeting() }),
          el('p.muted', { text: `Изучено ${prog.seen} из ${prog.total} слов · ${prog.mastered} закреплено` }),
          el('div.queue-pills', {}, [
            el('div.pill.due', {}, [el('b', { text: String(counts.due) }), el('span', { text: 'повторить' })]),
            el('div.pill.new', {}, [el('b', { text: String(counts.fresh) }), el('span', { text: 'новых' })]),
          ]),
        ]),
      ]),
      counts.total > 0
        ? el('button.btn.primary.big.start-btn', {
            onclick: () => { go('study'); },
          }, [`Учить — ${counts.total} ${plural(counts.total, 'слово', 'слова', 'слов')}`])
        : el('div.done-card', {}, [
            el('div.done-emoji', { html: '🎉' }),
            el('h3', { text: 'На сегодня всё!' }),
            el('p.muted', { text: 'Повторений нет. Можно выучить ещё новых слов или вернуться завтра.' }),
            el('button.btn.secondary', { onclick: () => { state.updateSettings({ newPerDay: state.getSettings().newPerDay + 10 }); go('home'); }, text: '+10 новых слов' }),
          ]),
      el('div.section-title', { text: 'Режим тренировки' }),
      el('div.mode-grid', {}, modes.map((m) =>
        el(`button.mode-card${focusMode === m.id ? '.active' : ''}`, {
          onclick: () => { focusMode = m.id; renderHome2(); },
        }, [
          el('div.mode-icon', { html: m.icon }),
          el('div.mode-label', { text: m.label }),
          el('div.mode-desc', { text: m.desc }),
        ])
      )),
      el('div.home-links', {}, [
        el('button.link-btn', { onclick: () => go('stats'), html: '📊 Статистика' }),
        el('button.link-btn', { onclick: () => go('browse'), html: '📚 Словарь' }),
      ]),
    ])
  );
}
function renderHome2() { clear(app); renderHome(); } // re-render to reflect mode selection

// ---------------------------------------------------------------- session
function pickMode(word, card, isNew) {
  if (focusMode === 'flash' || isNew) return Flashcard;
  if (focusMode === 'choice') return Choice;
  if (focusMode === 'type') return Typing;
  if (focusMode === 'listen') return Listening;
  // mix: escalate difficulty with card maturity
  const reps = card?.reps || 0;
  if (reps < 1) return Choice;
  const r = Math.random();
  if (reps < 3) return r < 0.6 ? Choice : Typing;
  if (r < 0.34) return Typing;
  if (r < 0.67) return Listening;
  return Choice;
}

function startSession() {
  const q = buildQueue();
  const order = [...q.due, ...q.fresh];
  if (!order.length) { go('home'); return; }
  // prefetch dictionary data + warm images for first words
  prefetch(order.slice(0, 12).map(getWord));
  order.slice(0, 8).map(getWord).forEach((w) => photoFor(w));

  session = {
    queue: order.map((id) => ({ id, isNew: !state.getCard(id) || state.getCard(id).state === 'new' })),
    index: 0,
    done: 0,
    correct: 0,
    xpGained: 0,
    startLevel: state.levelInfo().level,
    total: order.length,
    requeued: 0,
  };
  nextCard();
}

async function nextCard() {
  if (!session) return;
  if (session.cleanup) { session.cleanup(); session.cleanup = null; }

  if (session.index >= session.queue.length) return finishSession();

  const item = session.queue[session.index];
  const word = getWord(item.id);
  const card = state.ensureCard(word.id);
  const isNew = item.isNew;
  const Mode = pickMode(word, card, isNew);

  renderSessionFrame(word);
  const stage = document.getElementById('stage');

  // prefetch upcoming
  const upcoming = session.queue.slice(session.index + 1, session.index + 4).map((x) => getWord(x.id));
  prefetch(upcoming);
  upcoming.forEach((w) => photoFor(w));

  const info = await enrich(word).catch(() => null);
  if (!session || session.queue[session.index]?.id !== word.id) return; // navigated away

  const ctx = {
    word, info, isNew,
    cardRecord: card,
    onResult: (res) => handleResult(word, card, isNew, res),
  };
  Mode.render(stage, ctx);
  session.cleanup = ctx.cleanup;
}

function handleResult(word, card, isNew, { grade, correct }) {
  const settings = state.getSettings();
  const updated = review(card, grade, settings.retention);
  state.setCard(word.id, updated);
  const xp = state.recordReview({ correct, grade, isNew });
  session.xpGained += xp;
  session.done += 1;
  if (correct) session.correct += 1;

  // "Again" -> re-insert a few cards later in this session
  if (grade === Grade.AGAIN) {
    const reinsertAt = Math.min(session.queue.length, session.index + 4);
    session.queue.splice(reinsertAt, 0, { id: word.id, isNew: false, requeued: true });
    session.requeued += 1;
  }

  flashXp(xp, correct);
  maybeLevelUp();
  session.index += 1;
  renderTopbar();
  setTimeout(nextCard, 60);
}

function renderSessionFrame(word) {
  clear(app);
  const progress = session.queue.length
    ? Math.round((session.index / session.queue.length) * 100) : 0;
  app.appendChild(
    el('div.screen.study', {}, [
      el('div.study-head', {}, [
        el('button.icon-btn.close', { onclick: () => go('home'), title: 'Завершить', html: '✕' }),
        el('div.study-progress', {}, [el('i', { style: { width: progress + '%' } })]),
        el('div.study-count', { text: `${session.done}/${session.total}` }),
      ]),
      el('div.stage', { id: 'stage' }),
    ])
  );
}

function finishSession() {
  const acc = session.done ? Math.round((session.correct / session.done) * 100) : 0;
  const perfect = acc === 100 && session.done >= 5;
  if (perfect || session.xpGained >= 80) confetti();
  const learned = session.queue.filter((q) => q.isNew && !q.requeued).length;

  clear(app);
  app.appendChild(
    el('div.screen.summary', {}, [
      el('div.summary-card', {}, [
        el('div.summary-emoji', { html: perfect ? '🏆' : acc >= 70 ? '🎉' : '💪' }),
        el('h2', { text: perfect ? 'Идеально!' : 'Сессия завершена' }),
        el('div.summary-grid', {}, [
          summaryStat('+' + session.xpGained, 'XP', '⭐'),
          summaryStat(acc + '%', 'точность', '🎯'),
          summaryStat(String(session.done), 'повторов', '🔁'),
          summaryStat(String(learned), 'новых слов', '✦'),
        ]),
        el('div.summary-actions', {}, [
          el('button.btn.primary', { onclick: () => go('study'), text: 'Ещё подход' }),
          el('button.btn.secondary', { onclick: () => go('home'), text: 'На главную' }),
        ]),
      ]),
    ])
  );
  session = null;
  renderTopbar();
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const s = state.getStats();
  const prog = progressStats();
  const days = lastNDays(14);
  const max = Math.max(1, ...days.map((d) => (s.days[d.key]?.reviews || 0)));
  const accuracy = s.reviewsTotal ? Math.round((s.correctTotal / s.reviewsTotal) * 100) : 0;

  app.appendChild(
    el('div.screen.stats', {}, [
      el('button.back-btn', { onclick: () => go('home'), html: '← Назад' }),
      el('h2', { text: 'Статистика' }),
      el('div.stat-cards', {}, [
        bigStat('🔥', s.streak, 'серия', `рекорд ${s.bestStreak}`),
        bigStat('⭐', s.xp, 'XP', `уровень ${state.levelInfo().level}`),
        bigStat('📚', prog.seen, 'изучено', `из ${prog.total}`),
        bigStat('🎯', accuracy + '%', 'точность', `${s.reviewsTotal} повторов`),
        bigStat('✅', prog.mastered, 'закреплено', 'стабильность 60д+'),
        bigStat('🌱', prog.learning, 'в процессе', 'ещё учатся'),
      ]),
      el('div.section-title', { text: 'Активность за 14 дней' }),
      el('div.bar-chart', {}, days.map((d) => {
        const rv = s.days[d.key]?.reviews || 0;
        return el('div.bar-col', { title: `${d.label}: ${rv}` }, [
          el('div.bar', { style: { height: Math.round((rv / max) * 100) + '%' }, class: rv ? 'bar filled' : 'bar' }),
          el('div.bar-label', { text: d.dom }),
        ]);
      })),
      el('div.section-title', { text: 'Прогресс по уровням' }),
      el('div.level-progress', {}, ['A1', 'A2', 'B1', 'B2', 'C1'].map((lv) => levelBar(lv))),
    ])
  );
}

function levelBar(level) {
  const words = WORDS.filter((w) => w.level === level);
  let seen = 0;
  for (const w of words) { const c = state.getCard(w.id); if (c && c.state !== 'new') seen++; }
  const pct = words.length ? Math.round((seen / words.length) * 100) : 0;
  return el('div.lp-row', {}, [
    el('div.lp-name', { text: level }),
    el('div.lp-track', {}, [el('div.lp-fill', { style: { width: pct + '%' } })]),
    el('div.lp-num', { text: `${seen}/${words.length}` }),
  ]);
}

// ---------------------------------------------------------------- browse
function renderBrowse() {
  let query = '';
  let levelFilter = 'all';
  const list = el('div.browse-list');

  function update() {
    clear(list);
    const q = query.trim().toLowerCase();
    const items = WORDS.filter((w) =>
      (levelFilter === 'all' || w.level === levelFilter) &&
      (!q || w.en.includes(q) || w.ru.some((r) => r.includes(q)))
    ).slice(0, 300);
    for (const w of items) {
      const c = state.getCard(w.id);
      const status = !c || c.state === 'new' ? '' : c.s >= 60 ? 'mastered' : 'learning';
      list.appendChild(
        el(`div.browse-row.${status}`, { onclick: () => pronounce(w.en) }, [
          el('span.br-emoji', { html: w.emoji || '·' }),
          el('div.br-main', {}, [
            el('span.br-en', { text: w.en }),
            el('span.br-ru', { text: w.ru.join(', ') }),
          ]),
          el('span.br-level', { text: w.level }),
        ])
      );
    }
    if (!items.length) list.appendChild(el('p.muted', { text: 'Ничего не найдено' }));
  }

  const search = el('input.search-input', { type: 'search', placeholder: '🔎 поиск слова или перевода…' });
  search.addEventListener('input', () => { query = search.value; update(); });

  app.appendChild(
    el('div.screen.browse', {}, [
      el('button.back-btn', { onclick: () => go('home'), html: '← Назад' }),
      el('h2', { text: `Словарь · ${totalWords} слов` }),
      search,
      el('div.level-filter', {}, ['all', 'A1', 'A2', 'B1', 'B2', 'C1'].map((lv) =>
        el('button.lf-btn', { onclick: (e) => {
          levelFilter = lv; update();
          [...e.target.parentElement.children].forEach((c) => c.classList.remove('active'));
          e.target.classList.add('active');
        }, text: lv === 'all' ? 'Все' : lv, class: lv === 'all' ? 'lf-btn active' : 'lf-btn' })
      )),
      list,
    ])
  );
  update();
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const s = state.getSettings();
  app.appendChild(
    el('div.screen.settings', {}, [
      el('button.back-btn', { onclick: () => go('home'), html: '← Назад' }),
      el('h2', { text: 'Настройки' }),

      settingRow('Новых слов в день', sliderControl(s.newPerDay, 5, 50, 5, (v) => state.updateSettings({ newPerDay: v }))),
      settingRow('Целевое запоминание', sliderControl(Math.round(s.retention * 100), 70, 97, 1, (v) => state.updateSettings({ retention: v / 100 }), '%')),

      el('div.section-title', { text: 'Уровни слов' }),
      el('div.level-toggle', {}, ['A1', 'A2', 'B1', 'B2', 'C1'].map((lv) =>
        toggleChip(lv, s.levels.includes(lv), (on) => {
          const set = new Set(state.getSettings().levels);
          if (on) set.add(lv); else set.delete(lv);
          if (set.size === 0) set.add(lv); // never empty
          state.updateSettings({ levels: [...set].sort() });
        })
      )),

      el('div.section-title', { text: 'Звук и картинки' }),
      switchRow('Озвучивать автоматически', s.autoAudio, (v) => state.updateSettings({ autoAudio: v })),
      switchRow('Показывать фото (Pixabay)', s.images, (v) => state.updateSettings({ images: v })),
      settingRow('Pixabay API-ключ', (() => {
        const inp = el('input.text-input', { type: 'text', value: s.pixabayKey || '', placeholder: 'ключ для фото' });
        inp.addEventListener('change', () => state.updateSettings({ pixabayKey: inp.value.trim() }));
        return inp;
      })()),

      el('div.section-title', { text: 'Данные' }),
      el('div.data-actions', {}, [
        el('button.btn.secondary', { onclick: exportData, text: '⬇ Экспорт прогресса' }),
        el('button.btn.secondary', { onclick: importData, text: '⬆ Импорт' }),
        el('button.btn.danger', { onclick: resetData, text: '🗑 Сбросить всё' }),
      ]),
      el('p.muted.tiny', { text: 'Прогресс хранится локально в браузере (localStorage). Экспорт — резервная копия в файл.' }),
    ])
  );
}

// ---------------------------------------------------------------- widgets
function circularProgress(pct) {
  const r = 52, c = 2 * Math.PI * r;
  const wrap = el('div.ring');
  wrap.innerHTML = `
    <svg viewBox="0 0 120 120" width="120" height="120">
      <circle class="ring-bg" cx="60" cy="60" r="${r}"></circle>
      <circle class="ring-fg" cx="60" cy="60" r="${r}"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"
        transform="rotate(-90 60 60)"></circle>
    </svg>
    <div class="ring-label"><b>${pct}%</b><span>прогресс</span></div>`;
  return wrap;
}

function summaryStat(value, label, icon) {
  return el('div.sum-stat', {}, [
    el('div.sum-icon', { html: icon }),
    el('div.sum-value', { text: value }),
    el('div.sum-label', { text: label }),
  ]);
}
function bigStat(icon, value, label, sub) {
  return el('div.big-stat', {}, [
    el('div.bs-icon', { html: icon }),
    el('div.bs-value', { text: String(value) }),
    el('div.bs-label', { text: label }),
    el('div.bs-sub', { text: sub }),
  ]);
}
function settingRow(label, control) {
  return el('div.setting-row', {}, [el('label.setting-label', { text: label }), control]);
}
function sliderControl(value, min, max, step, onChange, suffix = '') {
  const out = el('span.slider-val', { text: value + suffix });
  const input = el('input.slider', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => { out.textContent = input.value + suffix; });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el('div.slider-wrap', {}, [input, out]);
}
function toggleChip(label, on, onChange) {
  const chip = el(`button.chip${on ? '.on' : ''}`, { text: label });
  chip.addEventListener('click', () => { const next = !chip.classList.contains('on'); chip.classList.toggle('on', next); onChange(next); });
  return chip;
}
function switchRow(label, on, onChange) {
  const sw = el(`button.switch${on ? '.on' : ''}`, {}, [el('i')]);
  sw.addEventListener('click', () => { const next = !sw.classList.contains('on'); sw.classList.toggle('on', next); onChange(next); });
  return el('div.setting-row', {}, [el('label.setting-label', { text: label }), sw]);
}

// ---------------------------------------------------------------- fx
function flashXp(xp, correct) {
  const f = el('div.xp-float', { text: (correct ? '+' : '+') + xp + ' XP' });
  f.classList.toggle('miss', !correct);
  document.body.appendChild(f);
  requestAnimationFrame(() => f.classList.add('go'));
  setTimeout(() => f.remove(), 1000);
}
function maybeLevelUp() {
  if (!session) return;
  const lvl = state.levelInfo().level;
  if (lvl > session.startLevel) {
    session.startLevel = lvl;
    confetti();
    toast(`🎉 Новый уровень: ${lvl}!`, 'success');
  }
}

// ---------------------------------------------------------------- data io
function exportData() {
  const blob = new Blob([state.exportState()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `wordowl-backup-${state.today()}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Прогресс экспортирован', 'success');
}
function importData() {
  const inp = el('input', { type: 'file', accept: 'application/json' });
  inp.addEventListener('change', () => {
    const file = inp.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { state.importState(reader.result); toast('Импортировано', 'success'); go('home'); }
      catch { toast('Не удалось прочитать файл', 'error'); }
    };
    reader.readAsText(file);
  });
  inp.click();
}
function resetData() {
  if (confirm('Сбросить весь прогресс, статистику и настройки? Это необратимо.')) {
    state.resetAll(); toast('Сброшено', 'success'); go('home');
  }
}

// ---------------------------------------------------------------- helpers
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи! 🌙';
  if (h < 12) return 'Доброе утро! ☀️';
  if (h < 18) return 'Добрый день! 👋';
  return 'Добрый вечер! 🌆';
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ key, dom: d.getDate(), label: d.toLocaleDateString('ru-RU') });
  }
  return out;
}

// theme
function applyTheme() {
  document.documentElement.dataset.theme = state.getSettings().theme || 'dark';
}

// ---------------------------------------------------------------- boot
applyTheme();
go('home');
window.WordOwl = { go, state }; // handy for debugging in the console
