/** Tiny DOM helpers shared across screens and game modes. */

/** el('div.foo.bar', {onclick}, [children|text]) -> HTMLElement */
export function el(spec, props = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** An audio "speak" button (🔊). */
export function audioButton(onClick) {
  return el('button.icon-btn.audio-btn', { onclick: onClick, title: 'Произношение', 'aria-label': 'Произношение' }, [
    el('span', { html: '🔊' }),
  ]);
}

/** Normalise a typed answer for comparison (lowercase, trim, strip articles/punct). */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ');
}

/** Levenshtein distance — used to allow near-miss typed answers. */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

export function toast(msg, kind = '') {
  const t = el(`div.toast.${kind}`, { text: msg });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1600);
}

/** Confetti burst for milestones (level-up, perfect session). */
export function confetti() {
  const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
  const layer = el('div.confetti');
  for (let i = 0; i < 60; i++) {
    const p = el('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.3 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2200);
}
