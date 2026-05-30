/**
 * FSRS (Free Spaced Repetition Scheduler) — the algorithm Anki adopted in 2023.
 *
 * It models each card with three numbers:
 *   - stability  (S): days until recall probability drops to ~90%
 *   - difficulty (D): 1..10, how hard the card intrinsically is
 *   - retrievability (R): current probability you still remember it
 *
 * After each review we feed back a grade (1=Again, 2=Hard, 3=Good, 4=Easy)
 * and recompute S, D, and the next due date. This is far smarter than fixed
 * intervals: a card you keep nailing gets spaced out fast, a card you fumble
 * comes back soon.
 *
 * Implementation follows FSRS-4.5 with the published default weights.
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki
 */

// Default FSRS-4.5 weights (w0..w16).
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // == 19/81

export const Grade = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const DAY = 86400000;
const clampD = (d) => Math.min(Math.max(d, 1), 10);

/** Retrievability after `t` days given stability `s`. */
export function retrievability(t, s) {
  return Math.pow(1 + (FACTOR * t) / s, DECAY);
}

/** Interval (days) to reach desired retention `rd` for stability `s`. */
function intervalForStability(s, rd) {
  const ivl = (s / FACTOR) * (Math.pow(rd, 1 / DECAY) - 1);
  return Math.max(1, Math.round(ivl));
}

function initStability(g) {
  return Math.max(W[g - 1], 0.1);
}

function initDifficulty(g) {
  return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
}

function nextDifficulty(d, g) {
  const delta = d - W[6] * (g - 3);
  // mean reversion toward the difficulty of an "easy" first answer
  return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * delta);
}

function nextStabilityRecall(d, s, r, g) {
  const hard = g === Grade.HARD ? W[15] : 1;
  const easy = g === Grade.EASY ? W[16] : 1;
  return (
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hard *
        easy)
  );
}

function nextStabilityForget(d, s, r) {
  return (
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r))
  );
}

/**
 * A fresh card record. `due` is an ISO string (null = brand new, never seen).
 */
export function newCard() {
  return { s: 0, d: 0, due: null, last: null, reps: 0, lapses: 0, state: 'new' };
}

/**
 * Apply a review grade to a card and return the updated card record.
 * @param {object} card  - record from newCard() or storage
 * @param {number} grade - Grade.AGAIN..Grade.EASY
 * @param {number} retention - desired retention (0.7..0.97), default 0.9
 * @param {number} now   - epoch ms (injectable for tests)
 */
export function review(card, grade, retention = 0.9, now = Date.now()) {
  const c = { ...card };
  let interval;

  if (c.state === 'new' || c.s === 0) {
    c.s = initStability(grade);
    c.d = initDifficulty(grade);
    c.reps = 1;
  } else {
    const elapsedDays = c.last ? Math.max(0, (now - c.last) / DAY) : 0;
    const r = retrievability(elapsedDays, c.s);
    c.d = nextDifficulty(c.d, grade);
    if (grade === Grade.AGAIN) {
      c.s = nextStabilityForget(c.d, c.s, r);
      c.lapses = (c.lapses || 0) + 1;
    } else {
      c.s = nextStabilityRecall(c.d, c.s, r, grade);
    }
    c.reps = (c.reps || 0) + 1;
  }

  // "Again" on any card => see it again very soon (within the session-ish).
  if (grade === Grade.AGAIN) {
    interval = 0; // due now; UI re-queues it this session
    c.state = 'relearning';
  } else {
    interval = intervalForStability(c.s, retention);
    c.state = 'review';
  }

  c.last = now;
  c.due = new Date(now + interval * DAY).toISOString();
  c.lastInterval = interval;
  return c;
}

/** Human-readable preview of the next interval for each grade (for buttons). */
export function previewIntervals(card, retention = 0.9, now = Date.now()) {
  const out = {};
  for (const g of [Grade.AGAIN, Grade.HARD, Grade.GOOD, Grade.EASY]) {
    const c = review(card, g, retention, now);
    out[g] = c.lastInterval;
  }
  return out;
}

/** Is the card due for review at time `now`? New cards are always "due". */
export function isDue(card, now = Date.now()) {
  if (!card || card.state === 'new' || !card.due) return true;
  return new Date(card.due).getTime() <= now;
}

/** Format an interval in days into a short label (e.g. "10м", "1д", "3нед"). */
export function fmtInterval(days) {
  if (days <= 0) return '<1м';
  if (days < 1) return Math.round(days * 1440) + 'м';
  if (days < 21) return days + 'д';
  if (days < 60) return Math.round(days / 7) + 'нед';
  if (days < 365) return Math.round(days / 30) + 'мес';
  return (days / 365).toFixed(1) + 'г';
}
