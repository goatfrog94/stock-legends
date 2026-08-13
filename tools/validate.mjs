/**
 * M1 검증기 — 매크로 오버레이가 의도대로 작동하는지 확인하고, 눈으로 볼 비교 차트를 뽑는다.
 *
 * 통과해야 할 것:
 *   A. 캔들 정합성 (h ≥ max(o,c), l ≤ min(o,c))
 *   B. 30년 총수익률 보존
 *   C. 위기 창에서 전 종목이 함께 빠진다     ← 오버레이의 존재 이유
 *   D. 종목 간 상관계수가 원본보다 올라간다  ← 공통 시장 레이어가 들어갔다는 증거
 *   E. 게임지수 대비 실현 베타가 설계 베타와 맞는다
 *   F. 오버레이가 비현실적 일간 변동을 만들지 않는다
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(await readFile(join(ROOT, 'data', 'game-data.json'), 'utf8'));
const N = D.meta.gameDays;

const logret = (c) => { const r = new Float64Array(c.length); for (let i = 1; i < c.length; i++) r[i] = Math.log(c[i] / c[i - 1]); return r; };
const corr = (a, b, from = 1, to = N) => {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = from; i <= to; i++) { sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; n++; }
  const cov = sab / n - (sa / n) * (sb / n);
  return cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
};
const betaOf = (a, m) => {
  let n = 0, sa = 0, sm = 0, smm = 0, sam = 0;
  for (let i = 1; i <= N; i++) { sa += a[i]; sm += m[i]; smm += m[i] * m[i]; sam += a[i] * m[i]; n++; }
  return (sam / n - (sa / n) * (sm / n)) / (smm / n - (sm / n) ** 2);
};
const P = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

const idxRet = logret(D.index);
const R = {};
for (const s of D.stocks) R[s.id] = { raw: logret(s.raw.c), ovl: logret(s.ovl.c) };

let fail = 0;
const check = (ok, label, detail) => { console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(46)} ${detail}`); if (!ok) fail++; };

/* ── A. 캔들 정합성 ── */
console.log('\n[A] 캔들 정합성');
for (const s of D.stocks) for (const v of ['raw', 'ovl']) {
  let bad = 0;
  const k = s[v];
  for (let i = 0; i <= N; i++) {
    if (k.h[i] < Math.max(k.o[i], k.c[i]) - 1e-6 || k.l[i] > Math.min(k.o[i], k.c[i]) + 1e-6) bad++;
    if (!(k.o[i] > 0 && k.c[i] > 0)) bad++;
  }
  check(bad === 0, `${s.name}(${s.archetype}) ${v}`, `이상 봉 ${bad}개 / ${N + 1}`);
}

/* ── B. 총수익률 보존 ── */
console.log('\n[B] 30년 총수익률 보존 (오버레이 전 → 후)');
for (const s of D.stocks) {
  const a = s.raw.c[N] / s.raw.c[0] - 1, b = s.ovl.c[N] / s.ovl.c[0] - 1;
  check(Math.abs(a - b) < 1e-4, `${s.name}(${s.archetype})`, `${P(a)} → ${P(b)}  (오차 ${((b - a) * 100).toFixed(5)}%p)`);
}

/* ── C. 위기 창에서 동반 하락 ── */
console.log('\n[C] 위기 창에서 전 종목이 함께 빠지는가');
const crashNames = D.crashWindows.map((w) => w.name);
D.crashWindows.forEach((w, wi) => {
  const im = D.index[w.b] / D.index[w.a] - 1;
  const parts = D.stocks.map((s) => {
    const a = s.raw.c[w.b] / s.raw.c[w.a] - 1, b = s.ovl.c[w.b] / s.ovl.c[w.a] - 1;
    return `${s.name} ${P(a).padStart(7)}→${P(b).padStart(7)}`;
  });
  const allDown = D.stocks.every((s) => s.ovl.c[w.b] / s.ovl.c[w.a] - 1 < 0);
  check(allDown, `${crashNames[wi]} (지수 ${P(im)})`, parts.join('  '));
});

/* ── D. 종목 간 상관계수 상승 ── */
console.log('\n[D] 종목 간 일간수익률 상관계수 (원본 → 오버레이)');
for (let i = 0; i < D.stocks.length; i++) for (let j = i + 1; j < D.stocks.length; j++) {
  const A = D.stocks[i], B = D.stocks[j];
  const a = corr(R[A.id].raw, R[B.id].raw), b = corr(R[A.id].ovl, R[B.id].ovl);
  check(b > a, `${A.name} ↔ ${B.name}`, `${a.toFixed(3)} → ${b.toFixed(3)}`);
}

/* ── E. 게임지수 대비 실현 베타 ── */
console.log('\n[E] 게임지수 대비 실현 베타 (설계 β와 비교)');
for (const s of D.stocks) {
  const br = betaOf(R[s.id].raw, idxRet), bo = betaOf(R[s.id].ovl, idxRet);
  check(Math.abs(bo - s.beta) < 0.45, `${s.name}(${s.archetype}) 설계 β=${s.beta}`, `원본 ${br.toFixed(2)} → 오버레이 ${bo.toFixed(2)}`);
}

/* ── F. 일간 변동 폭 ── */
console.log('\n[F] 일간 변동 폭 (오버레이가 비현실적 봉을 만들지 않는가)');
for (const s of D.stocks) {
  let mr = 0, mo = 0;
  for (let i = 1; i <= N; i++) { mr = Math.max(mr, Math.abs(R[s.id].raw[i])); mo = Math.max(mo, Math.abs(R[s.id].ovl[i])); }
  check(mo < mr * 1.6 + 0.1, `${s.name}(${s.archetype}) 최대 일간변동`, `${P(Math.exp(mr) - 1)} → ${P(Math.exp(mo) - 1)}`);
}

/* ════════════════════ 비교 차트 SVG ════════════════════ */
const W = 1500, ROW = 190, PAD = 56, TOP = 46;
const panels = [{ key: 'INDEX', title: '게임 시장지수 (저작한 30년 연표)', color: '#191f28' },
...D.stocks.map((s) => ({ key: s.id, title: `${s.name} — ${s.name} · ${s.archetype} · β ${s.beta}`, color: s.id === 'CSCO' ? '#f04452' : s.id === 'AMD' ? '#ff9f0a' : '#3182f6' }))];
const H = TOP + panels.length * ROW + 30;

const path = (arr, x0, y0, w, h) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const L0 = Math.log(lo), L1 = Math.log(hi);
  let d = '';
  const step = Math.max(1, Math.floor(arr.length / 2200));
  for (let i = 0; i < arr.length; i += step) {
    const x = x0 + (i / (arr.length - 1)) * w;
    const y = y0 + h * (1 - (Math.log(arr[i]) - L0) / (L1 - L0));
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return { d, lo, hi };
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI,Malgun Gothic,sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${PAD}" y="28" font-size="17" font-weight="700" fill="#191f28">매크로 오버레이 검증 — 회색 = 원본(원래 시장) · 컬러 = 오버레이 적용(게임 시장)</text>`;

panels.forEach((p, pi) => {
  const y0 = TOP + pi * ROW, h = ROW - 44, x0 = PAD, w = W - PAD * 2;
  svg += `<text x="${x0}" y="${y0 + 12}" font-size="12.5" font-weight="700" fill="#191f28">${p.title}</text>`;
  // 위기 창 음영
  for (const wd of D.crashWindows) {
    const xa = x0 + (wd.a / N) * w, xb = x0 + (wd.b / N) * w;
    svg += `<rect x="${xa.toFixed(1)}" y="${y0 + 20}" width="${Math.max(2, xb - xa).toFixed(1)}" height="${h}" fill="#f04452" opacity="0.09"/>`;
  }
  svg += `<rect x="${x0}" y="${y0 + 20}" width="${w}" height="${h}" fill="none" stroke="#e5e8eb"/>`;
  if (p.key === 'INDEX') {
    const r = path(Array.from(D.index), x0, y0 + 20, w, h);
    svg += `<path d="${r.d}" fill="none" stroke="${p.color}" stroke-width="1.4"/>`;
    svg += `<text x="${x0 + w - 4}" y="${y0 + 34}" font-size="10.5" text-anchor="end" fill="#8b95a1">${Math.round(r.lo)} ~ ${Math.round(r.hi)}</text>`;
  } else {
    const s = D.stocks.find((x) => x.id === p.key);
    const g = path(s.raw.c, x0, y0 + 20, w, h);
    const o = path(s.ovl.c, x0, y0 + 20, w, h);
    svg += `<path d="${g.d}" fill="none" stroke="#b0b8c1" stroke-width="1.1"/>`;
    svg += `<path d="${o.d}" fill="none" stroke="${p.color}" stroke-width="1.4"/>`;
    svg += `<text x="${x0 + w - 4}" y="${y0 + 34}" font-size="10.5" text-anchor="end" fill="#8b95a1">실제 ${s.realFrom} ~ ${s.realTo} · 30년 ${P(s.raw.c[N] / s.raw.c[0] - 1)}</text>`;
  }
  // 연도 눈금
  for (let yr = 0; yr <= 30; yr += 5) {
    const x = x0 + (yr / 30) * w;
    svg += `<text x="${x.toFixed(1)}" y="${y0 + 20 + h + 13}" font-size="9.5" text-anchor="middle" fill="#b0b8c1">${yr}년</text>`;
  }
});
// 위기 라벨
D.crashWindows.forEach((wd, i) => {
  const x = PAD + ((wd.a + wd.b) / 2 / N) * (W - PAD * 2);
  svg += `<text x="${x.toFixed(1)}" y="${TOP + 8}" font-size="10" text-anchor="middle" fill="#f04452" font-weight="700">${crashNames[i]}</text>`;
});
svg += '</svg>';

const out = join(ROOT, 'data', 'overlay-check.svg');
await writeFile(out, svg);

console.log(`\n${'─'.repeat(70)}`);
console.log(fail === 0 ? '전체 통과' : `실패 ${fail}건`);
console.log(`비교 차트: ${out}`);
