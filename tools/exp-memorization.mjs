/**
 * 실험 두 가지
 *
 * [1] 시스코 배제 문제
 *     - 시스코 30년 창을 오프셋별로 훑어 총수익률 분포를 본다.
 *       "총수익 상한 제약"으로 순화가 가능한 종목인지, 아니면 통째로 빼야 하는지 결정한다.
 *     - 최고점 대비 배수도 같이 본다. (팔았으면 얼마였나 = 교육 소재로서의 가치)
 *
 * [2] 반복 플레이 암기 문제
 *     - 같은 종목을 오프셋 + 위기 캘린더 지터를 바꿔 여러 변형으로 만든 뒤,
 *       정규화 로그가격 경로가 얼마나 달라지는지 상관계수로 측정한다.
 *     - 기준점: 서로 다른 종목끼리의 상관 = "완전히 다른 차트"의 수치
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const DPY = 250, N = 30 * DPY;

/* ── 공통 유틸 (build-game-data.mjs와 동일 로직) ── */
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeNormal(rand){let sp=null;return()=>{if(sp!==null){const s=sp;sp=null;return s;}let u,v,s;do{u=rand()*2-1;v=rand()*2-1;s=u*u+v*v;}while(s>=1||s===0);const m=Math.sqrt(-2*Math.log(s)/s);sp=v*m;return u*m;};}

const BASE_ANCHORS = [[0,1000],[1500,2400],[1650,1560],[1800,1900],[2750,5200],[3300,2500],
  [3500,2700],[4800,5600],[5100,2800],[5375,3600],[6750,8200],[6790,5400],[6975,8000],[7500,11000]];
const SEG_VOL = [.14,.35,.28,.19,.32,.26,.14,.40,.30,.13,.60,.35,.19];

/** 위기 캘린더를 ±jitter일 흔든다 (앵커 순서는 유지) */
function jitterAnchors(rand, jitter) {
  const a = BASE_ANCHORS.map(([d, l]) => [d, l]);
  for (let i = 1; i < a.length - 1; i++) {
    a[i][0] += Math.round((rand() * 2 - 1) * jitter);
  }
  for (let i = 1; i < a.length; i++) a[i][0] = Math.max(a[i][0], a[i - 1][0] + 60);
  a[a.length - 1][0] = N;
  return a;
}

function buildIndex(seed, jitter) {
  const rand = mulberry32(seed), normal = makeNormal(rand);
  const A = jitterAnchors(rand, jitter);
  const ret = new Float64Array(N + 1);
  for (let s = 0; s < A.length - 1; s++) {
    const [d0, l0] = A[s], [d1, l1] = A[s + 1];
    const n = d1 - d0; if (n <= 0) continue;
    const drift = Math.log(l1 / l0) / n, sd = SEG_VOL[s] / Math.sqrt(DPY);
    const z = new Float64Array(n); let sum = 0;
    for (let i = 0; i < n; i++) { z[i] = normal() * sd; sum += z[i]; }
    const mean = sum / n;
    for (let i = 0; i < n; i++) if (d0 + i + 1 <= N) ret[d0 + i + 1] = drift + (z[i] - mean);
  }
  return { ret, anchors: A };
}

function returnsAndBeta(rows, spx) {
  const n = rows.length, rs = new Float64Array(n), rm = new Float64Array(n);
  let last = null;
  for (let i = 0; i < n; i++) {
    const v = spx.get(rows[i].d) ?? last;
    if (i > 0) { rs[i] = Math.log(rows[i].c / rows[i-1].c); rm[i] = (v != null && last != null) ? Math.log(v / last) : 0; }
    if (v != null) last = v;
  }
  const W = 250, beta = new Float64Array(n);
  let sX=0,sY=0,sXX=0,sXY=0,cnt=0;
  for (let i = 1; i < n; i++) {
    sX+=rm[i];sY+=rs[i];sXX+=rm[i]*rm[i];sXY+=rm[i]*rs[i];cnt++;
    if (cnt > W) { const j=i-W; sX-=rm[j];sY-=rs[j];sXX-=rm[j]*rm[j];sXY-=rm[j]*rs[j];cnt--; }
    if (cnt >= 30) {
      const cov = sXY/cnt - (sX/cnt)*(sY/cnt), vm = sXX/cnt - (sX/cnt)**2;
      beta[i] = vm > 1e-12 ? clamp(cov/vm, .3, 2) : 1;
    } else beta[i] = 1;
  }
  const fv = beta[Math.min(W, n-1)] || 1;
  for (let i = 0; i < Math.min(W, n); i++) beta[i] = fv;
  return { rm, beta };
}

function overlayClose(rows, offset, beta, rm, gameRet) {
  const lk = new Float64Array(N + 1);
  for (let t = 1; t <= N; t++) lk[t] = clamp(beta[offset+t] * (gameRet[t] - rm[offset+t]), -.10, .10);
  const cum = new Float64Array(N + 1);
  for (let t = 1; t <= N; t++) cum[t] = cum[t-1] + lk[t];
  const end = cum[N], out = new Float64Array(N + 1);
  for (let t = 0; t <= N; t++) out[t] = rows[offset+t].c * Math.exp(clamp(cum[t] - end*(t/N), -1.1, 1.1));
  return out;
}

/** 정규화 로그가격 경로의 상관계수 = "차트가 얼마나 닮았는가" */
function pathCorr(a, b) {
  const la = [], lb = [];
  for (let t = 0; t <= N; t++) { la.push(Math.log(a[t]/a[0])); lb.push(Math.log(b[t]/b[0])); }
  const n = la.length;
  let sa=0,sb=0; for(let i=0;i<n;i++){sa+=la[i];sb+=lb[i];}
  const ma=sa/n, mb=sb/n;
  let num=0,da=0,db=0;
  for(let i=0;i<n;i++){const x=la[i]-ma,y=lb[i]-mb;num+=x*y;da+=x*x;db+=y*y;}
  return num/Math.sqrt(da*db);
}
const P = (v) => (v>=0?'+':'') + (v*100).toFixed(0) + '%';
const X = (v) => v.toFixed(1) + '배';

/* ══════════════════ 실행 ══════════════════ */
const spxRaw = JSON.parse(await readFile(join(RAW, 'SPX.json'), 'utf8'));
const spx = new Map(spxRaw.rows.map(r => [r.d, r.c]));
const load = async (id) => JSON.parse(await readFile(join(RAW, `${id}.json`), 'utf8')).rows;
const csco = await load('CSCO'), amd = await load('AMD'), kep = await load('KEP');

/* ── [1] 시스코 30년 창별 총수익률 분포 ── */
console.log('\n[1] 시스코 — 30년 창을 어디서 자르느냐에 따른 총수익률\n');
console.log('  시작일        총수익      최고점배수   최고점 시점    최고점에서 팔았다면');
console.log('  ' + '─'.repeat(76));
const maxOff = csco.length - N - 1;
const samples = [];
for (let o = 0; o <= maxOff; o += 20) {
  const c0 = csco[o].c;
  let peak = 0, peakAt = 0;
  for (let t = 0; t <= N; t++) { const m = csco[o+t].c / c0; if (m > peak) { peak = m; peakAt = t; } }
  samples.push({ o, date: csco[o].d, total: csco[o+N].c/c0, peak, peakAt });
}
for (const s of samples.filter((_, i) => i % 12 === 0 || i === samples.length-1)) {
  console.log(`  ${s.date}  ${X(s.total).padStart(9)}  ${X(s.peak).padStart(10)}   ${(s.peakAt/DPY).toFixed(1)}년차`
    + `      ${X(s.peak).padStart(9)}`);
}
const tot = samples.map(s => s.total);
console.log(`\n  → 총수익 범위: ${X(Math.min(...tot))} ~ ${X(Math.max(...tot))}  (어느 창을 잘라도 최소 ${X(Math.min(...tot))})`);
console.log(`  → 최고점 배수 범위: ${X(Math.min(...samples.map(s=>s.peak)))} ~ ${X(Math.max(...samples.map(s=>s.peak)))}`);

/* ── [2] 암기 방지 실험 ── */
console.log('\n\n[2] 같은 종목의 변형끼리 차트가 얼마나 달라지는가\n');
const { rm: rmC, beta: bC } = returnsAndBeta(csco, spx);
const { rm: rmA, beta: bA } = returnsAndBeta(amd, spx);
const { rm: rmK, beta: bK } = returnsAndBeta(kep, spx);

const variants = [
  { label: '변형1 (오프셋   8, 시드 A)', off: 8,    seed: 19940415 },
  { label: '변형2 (오프셋 600, 시드 B)', off: 600,  seed: 777 },
  { label: '변형3 (오프셋 1200, 시드 C)', off: 1200, seed: 31337 },
  { label: '변형4 (오프셋 1680, 시드 D)', off: 1680, seed: 8888 },
];
const built = variants.map(v => {
  const g = buildIndex(v.seed, 375);   // 위기 창 ±1.5년 지터
  return { ...v, c: overlayClose(csco, v.off, bC, rmC, g.ret), crashAt: g.anchors[5][0] };
});

console.log('  같은 시스코, 오프셋 + 위기 캘린더만 바꿈 → 로그가격 경로 상관계수');
console.log('  ' + '─'.repeat(76));
for (let i = 0; i < built.length; i++) for (let j = i+1; j < built.length; j++) {
  const r = pathCorr(built[i].c, built[j].c);
  console.log(`  ${built[i].label} ↔ ${built[j].label}   ${r.toFixed(3)}`);
}

console.log('\n  기준점 — 완전히 다른 종목끼리는 얼마나 나오는가');
console.log('  ' + '─'.repeat(76));
const gRef = buildIndex(19940415, 0);
const cRef = overlayClose(csco, 8, bC, rmC, gRef.ret);
const aRef = overlayClose(amd, 3849, bA, rmA, gRef.ret);
const kRef = overlayClose(kep, 224, bK, rmK, gRef.ret);
console.log(`  시스코 ↔ AMD          ${pathCorr(cRef, aRef).toFixed(3)}`);
console.log(`  시스코 ↔ 한국전력      ${pathCorr(cRef, kRef).toFixed(3)}`);
console.log(`  AMD    ↔ 한국전력      ${pathCorr(aRef, kRef).toFixed(3)}`);

console.log('\n  참고 — 오버레이 없이 오프셋만 바꿨을 때 (지금 대비 얼마나 효과가 있나)');
console.log('  ' + '─'.repeat(76));
const plain = (off) => { const a = new Float64Array(N+1); for (let t=0;t<=N;t++) a[t]=csco[off+t].c; return a; };
for (let i = 0; i < variants.length; i++) for (let j = i+1; j < variants.length; j++) {
  console.log(`  오프셋 ${String(variants[i].off).padStart(4)} ↔ ${String(variants[j].off).padStart(4)}   ${pathCorr(plain(variants[i].off), plain(variants[j].off)).toFixed(3)}`);
}
console.log('');
