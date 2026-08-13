/**
 * 캔들 모양 이상치 진단
 *
 * "일봉이 상하로 별로 크지 않고 윗꼬리가 긴" 종목이 왜 생기는지 찾는다.
 * 후보 원인
 *   (a) 거래가 뜸한 ADR — 체결이 드물어 시가=종가인 날이 많고, 가끔 스파이크만 찍힌다
 *   (b) 한국 1990년대 가격제한폭 — ±6~8% 시절이라 일간 범위 자체가 눌려 있다
 *   (c) 저가 구간의 호가단위(틱) 양자화
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WDIR = join(ROOT, 'data', 'w');

const med = (a) => { const b = Float64Array.from(a).sort(); return b[b.length >> 1]; };

function shape(k, from, to) {
  const range = [], body = [], upper = [], lower = [];
  let flat = 0, noBody = 0, noUp = 0, noDn = 0, n = 0;
  const EPS = 1e-9;
  for (let i = from; i <= to; i++) {
    const o = k.o[i], h = k.h[i], l = k.l[i], c = k.c[i];
    if (!(c > 0)) continue;
    n++;
    range.push((h - l) / c);
    if (Math.abs(c - o) < EPS) noBody++;                 // 시가=종가 (몸통 없음)
    if (h - Math.max(o, c) < EPS) noUp++;                // 윗꼬리 없음
    if (Math.min(o, c) - l < EPS) noDn++;                // 아랫꼬리 없음
    if (h - l < EPS) { flat++; continue; }               // 하루 종일 한 가격
    body.push(Math.abs(c - o) / (h - l));
    upper.push((h - Math.max(o, c)) / (h - l));
    lower.push((Math.min(o, c) - l) / (h - l));
  }
  return {
    n,
    range: med(range) * 100, body: med(body) * 100,
    upper: med(upper) * 100, lower: med(lower) * 100,
    flat: (flat / n) * 100, noBody: (noBody / n) * 100,
    noUp: (noUp / n) * 100, noDn: (noDn / n) * 100,
  };
}

const files = (await readdir(WDIR)).filter((f) => f.endsWith('.json'));
const rows = [];
for (const f of files) {
  const w = JSON.parse(await readFile(join(WDIR, f), 'utf8'));
  const N = w.ovl.c.length - 1;
  rows.push({ wid: w.wid, name: w.name, mkt: w.mkt, from: w.realFrom, to: w.realTo,
              all: shape(w.ovl, 0, N), early: shape(w.ovl, 0, 2000), late: shape(w.ovl, N - 2000, N) });
}

rows.sort((a, b) => a.all.range - b.all.range);
console.log('일간 고저폭이 작은 순 (중앙값). flat = 고가와 저가가 같은 날 비율\n');
console.log('종목            시장  기간                    고저폭%  몸통%  윗꼬리%  아랫꼬리%  flat%');
console.log('─'.repeat(96));
for (const r of rows) {
  const s = r.all;
  console.log(`${r.name.padEnd(14)} ${r.mkt}   ${r.from}~${r.to}  ` +
    `${s.range.toFixed(2).padStart(6)}  ${s.body.toFixed(0).padStart(5)}  ${s.upper.toFixed(0).padStart(6)}  ` +
    `${s.lower.toFixed(0).padStart(7)}  ${s.flat.toFixed(2).padStart(6)}`);
}

console.log('\n\n── 이상치 상위 8개: 초반 2,000봉 vs 후반 2,000봉 ──');
console.log('종목            구간   고저폭%  몸통%  윗꼬리%  flat%');
console.log('─'.repeat(60));
for (const r of rows.slice(0, 8)) {
  for (const [lab, s] of [['초반', r.early], ['후반', r.late]]) {
    console.log(`${(lab === '초반' ? r.name : '').padEnd(14)} ${lab}  ` +
      `${s.range.toFixed(2).padStart(7)}  ${s.body.toFixed(0).padStart(5)}  ${s.upper.toFixed(0).padStart(6)}  ${s.flat.toFixed(2).padStart(6)}`);
  }
}

console.log('\n\n── 품질 게이트용 분포 (창 전체 기준, 나쁜 순) ──');
console.log('종목            시장  flat%   시가=종가%  윗꼬리없음%  아랫꼬리없음%');
console.log('─'.repeat(70));
const q = rows.slice().sort((a, b) =>
  (b.all.flat + b.all.noBody + b.all.noUp + b.all.noDn) - (a.all.flat + a.all.noBody + a.all.noUp + a.all.noDn));
for (const r of q.slice(0, 18)) {
  const s = r.all;
  console.log(`${r.name.padEnd(14)} ${r.mkt}   ${s.flat.toFixed(2).padStart(5)}  ` +
    `${s.noBody.toFixed(1).padStart(9)}  ${s.noUp.toFixed(1).padStart(10)}  ${s.noDn.toFixed(1).padStart(12)}   ${r.from}`);
}
console.log('  … (이하 정상)');
const p = (f) => { const v = rows.map(f).sort((a, b) => a - b); return `중앙 ${v[v.length >> 1].toFixed(1)} / 상위10% ${v[Math.floor(v.length * 0.9)].toFixed(1)}`; };
console.log(`\n  flat        ${p((r) => r.all.flat)}`);
console.log(`  시가=종가    ${p((r) => r.all.noBody)}`);
console.log(`  윗꼬리없음   ${p((r) => r.all.noUp)}`);
console.log(`  아랫꼬리없음 ${p((r) => r.all.noDn)}`);

console.log('\n\n── 시장별 평균 ──');
for (const mkt of ['US', 'KR', 'JP']) {
  const g = rows.filter((r) => r.mkt === mkt);
  const avg = (f) => (g.reduce((a, r) => a + f(r), 0) / g.length).toFixed(2);
  console.log(`  ${mkt}  창 ${String(g.length).padStart(2)}개  고저폭 ${avg((r) => r.all.range)}%  ` +
    `몸통 ${avg((r) => r.all.body)}%  윗꼬리 ${avg((r) => r.all.upper)}%  flat ${avg((r) => r.all.flat)}%`);
}
