#!/usr/bin/env node
/**
 * Dataset builder for the English-learning game.
 *
 * Merges three open data sources into one bundled word list (js/data.words.js):
 *   1. COCA / filiph top-5000 frequency list  -> learning order, POS, CEFR level
 *   2. MUSE en-ru bilingual dictionary (53k)   -> Russian translations
 *   3. local emoji-map.json                     -> picture fallback
 *
 * Output is written as an ES module (`export const WORDS = [...]`) so the app
 * works even when opened from file:// (no fetch / CORS needed).
 *
 * Run:  node tools/build-dataset.mjs [maxWords=3000]
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MAX = Number(process.argv[2] || 3000);

const FREQ_URL = 'https://raw.githubusercontent.com/filiph/english_words/master/data/word-freq-top5000.csv';
const MUSE_URL = 'https://dl.fbaipublicfiles.com/arrival/dictionaries/en-ru.txt';

const POS_MAP = {
  n: 'noun', v: 'verb', j: 'adjective', a: 'article', r: 'adverb',
  i: 'preposition', p: 'pronoun', c: 'conjunction', d: 'determiner',
  m: 'number', t: 'particle', u: 'interjection', x: 'other', e: 'other',
};

const POS_RU = {
  noun: 'сущ.', verb: 'глаг.', adjective: 'прил.', adverb: 'нареч.',
  preposition: 'предл.', pronoun: 'мест.', conjunction: 'союз',
  article: 'артикль', determiner: 'опред.', number: 'числ.',
  particle: 'частица', interjection: 'межд.', other: '',
};

// Frequency rank -> CEFR-ish level bucket.
function levelFor(rank) {
  if (rank <= 300) return 'A1';
  if (rank <= 750) return 'A2';
  if (rank <= 1500) return 'B1';
  if (rank <= 2800) return 'B2';
  return 'C1';
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function isCyrillic(s) {
  return /[а-яё]/i.test(s) && !/[a-z]/i.test(s.replace(/[а-яё\s\-']/gi, ''));
}

async function main() {
  console.log(`Building dataset (max ${MAX} words)...`);

  // ---- 1. Frequency list ------------------------------------------------
  console.log('Fetching frequency list...');
  const freqCsv = await fetchText(FREQ_URL);
  const freqRows = freqCsv.trim().split('\n').slice(1); // drop header
  // word -> {rank, pos}.  Keep the FIRST (most frequent) occurrence of a word.
  const freq = new Map();
  let rank = 0;
  for (const row of freqRows) {
    const [, word, posLetter] = row.split(',');
    if (!word) continue;
    const w = word.trim().toLowerCase();
    if (!/^[a-z][a-z\-']*$/.test(w)) continue; // skip punctuation-ish
    if (!freq.has(w)) {
      rank += 1;
      freq.set(w, { rank, pos: POS_MAP[posLetter?.trim()] || 'other' });
    }
  }
  console.log(`  ${freq.size} unique frequency words`);

  // ---- 2. MUSE translations --------------------------------------------
  console.log('Fetching MUSE en-ru dictionary...');
  const muse = await fetchText(MUSE_URL);
  const trans = new Map(); // en -> [ru, ru, ...]
  for (const line of muse.split('\n')) {
    const [en, ru] = line.trim().split(/\s+/);
    if (!en || !ru) continue;
    const e = en.toLowerCase();
    if (!freq.has(e)) continue;            // only words we'll actually use
    if (!isCyrillic(ru)) continue;          // drop latin / identity / noise
    const r = ru.toLowerCase().trim();
    if (r.length < 2) continue;
    const arr = trans.get(e) || [];
    if (!arr.includes(r) && arr.length < 4) arr.push(r);
    trans.set(e, arr);
  }
  console.log(`  ${trans.size} words got a Russian translation`);

  // ---- 3. emoji map -----------------------------------------------------
  const emoji = JSON.parse(readFileSync(join(__dirname, 'emoji-map.json'), 'utf8'));

  // ---- merge ------------------------------------------------------------
  const words = [];
  for (const [w, info] of freq) {
    const ru = trans.get(w);
    if (!ru || ru.length === 0) continue; // skip words with no translation
    words.push({
      id: words.length + 1,
      en: w,
      ru,
      pos: info.pos,
      posRu: POS_RU[info.pos] || '',
      rank: info.rank,
      level: levelFor(info.rank),
      emoji: emoji[w] || null,
    });
    if (words.length >= MAX) break;
  }

  // Re-rank sequentially (some freq ranks were skipped for missing translations)
  words.sort((a, b) => a.rank - b.rank);
  words.forEach((x, i) => { x.id = i + 1; });

  // ---- stats ------------------------------------------------------------
  const byLevel = {};
  let withEmoji = 0;
  for (const x of words) {
    byLevel[x.level] = (byLevel[x.level] || 0) + 1;
    if (x.emoji) withEmoji += 1;
  }
  console.log(`\nFinal: ${words.length} words`);
  console.log('By level:', byLevel);
  console.log(`With emoji: ${withEmoji}`);

  // ---- write ------------------------------------------------------------
  const header = `// AUTO-GENERATED by tools/build-dataset.mjs — do not edit by hand.
// ${words.length} words · sources: COCA/filiph freq, MUSE en-ru, emoji-map.
// Levels: ${JSON.stringify(byLevel)}
`;
  const body = `export const WORDS = ${JSON.stringify(words)};\n`;
  writeFileSync(join(ROOT, 'js', 'data.words.js'), header + body);
  console.log(`\nWrote js/data.words.js (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
