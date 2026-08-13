/**
 * 리더보드 기준이 적절한지 검증한다.
 * "아무것도 안 하고 그냥 다 사서 들고 있기"가 지수 대비 몇 %의 알파를 내는지 재본다.
 * 이 값이 크게 플러스면 지수 대비 알파는 너무 후한 기준이라는 뜻이다.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const ARCH_WIN = ['폭발형', '우상향형'];
const ARCH_LOSE = ['붕괴형', '쇠퇴형'];
const ARCH_DEF = ['방어형'];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawUniverse(all, n, rand) {
  const pool = all.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = [], used = new Set();
  const take = (pred, k) => {
    for (const w of pool) {
      if (picked.length >= n || k <= 0) break;
      if (used.has(w.id) || !pred(w)) continue;
      picked.push(w); used.add(w.id); k--;
    }
  };
  const need = (pred, k) => take(pred, k - picked.filter(pred).length);
  need((w) => ARCH_WIN.includes(w.archetype), 2);
  need((w) => ARCH_LOSE.includes(w.archetype), 2);
  need((w) => ARCH_DEF.includes(w.archetype), 1);
  need((w) => w.mkt === 'KR', 1);
  take(() => true, n);
  return picked.slice(0, n);
}

const M = JSON.parse(await readFile(join(DATA, 'manifest.json'), 'utf8'));
const { warmup: W, totalDays: T } = M.meta;
const idxMult = M.index[T] / M.index[W];

// 창 데이터를 한 번만 읽어 캐시
const cache = new Map();
async function closes(wid) {
  if (!cache.has(wid)) cache.set(wid, JSON.parse(await readFile(join(DATA, 'w', `${wid}.json`), 'utf8')).ovl.c);
  return cache.get(wid);
}

const RUNS = 300;
const res = { ewbh: [], ewr: [], best: [], worst: [], rand1: [] };

for (let r = 0; r < RUNS; r++) {
  const rand = mulberry32(0x51ed + r * 2654435761);
  const n = 6 + Math.floor(rand() * 5);
  const uni = drawUniverse(M.windows, n, rand);
  const cs = [];
  for (const w of uni) cs.push(await closes(w.wid));

  const mults = cs.map((c) => c[T] / c[W]);
  res.ewbh.push(mults.reduce((a, b) => a + b, 0) / mults.length);
  res.best.push(Math.max(...mults));
  res.worst.push(Math.min(...mults));
  res.rand1.push(mults[Math.floor(rand() * mults.length)]);

  // 동일가중 매일 리밸런싱
  let p = 1;
  for (let t = W + 1; t <= T; t++) {
    let m = 0;
    for (const c of cs) m += c[t] / c[t - 1] - 1;
    p *= 1 + m / cs.length;
  }
  res.ewr.push(p);
}

const pctl = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };
const alpha = (m) => m / idxMult - 1;
const line = (label, arr) => {
  const med = pctl(arr, 0.5);
  const winRate = arr.filter((m) => m > idxMult).length / arr.length;
  console.log(
    `${label.padEnd(26)} 중앙 ${med.toFixed(1).padStart(6)}배  ` +
    `알파 중앙 ${(alpha(med) * 100).toFixed(0).padStart(6)}%  ` +
    `하위25% ${(alpha(pctl(arr, 0.25)) * 100).toFixed(0).padStart(6)}%  ` +
    `상위25% ${(alpha(pctl(arr, 0.75)) * 100).toFixed(0).padStart(6)}%  ` +
    `지수이길확률 ${(winRate * 100).toFixed(0).padStart(3)}%`
  );
};

console.log(`\n게임 지수 30년: ${idxMult.toFixed(1)}배   (표본 ${RUNS}판)\n`);
console.log('전략                        ');
console.log('─'.repeat(112));
line('전 종목 동일가중 B&H', res.ewbh);
line('전 종목 동일가중 리밸런싱', res.ewr);
line('아무 종목 1개 몰빵', res.rand1);
line('최고 종목 1개 (신의 눈)', res.best);
line('최악 종목 1개', res.worst);

const s = res.ewbh.slice().sort((a, b) => a - b);
const gradeOf = (a) => (a >= 0.5 ? 'S' : a >= 0.15 ? 'A' : a >= -0.15 ? 'B' : 'C');
const g = {};
for (const m of res.ewbh) { const k = gradeOf(alpha(m)); g[k] = (g[k] || 0) + 1; }
console.log(`\n"그냥 다 사서 들고 있기"의 등급 분포 (낙폭 감점 전):`);
console.log('  ' + ['S', 'A', 'B', 'C'].map((k) => `${k} ${((g[k] || 0) / RUNS * 100).toFixed(0)}%`).join('  ·  '));
