/**
 * 게임 데이터 빌더 (M3 — 44종목 · 다중 창)
 *
 *  1) 게임 연표 저작 + 위기 캘린더 최적화  — 유니버스 전체에 맞춰 위기 창 위치를 좌표하강으로 찾는다
 *  2) 종목별 롤링 베타                      — 홈 지수(미국상장=S&P500, KRX=코스피) 대비
 *  3) 창 선택                                — 총수익 밴드 + 위기 정렬. 여유가 크면 한 종목에서 2개
 *  4) 매크로 오버레이                        — 원래 시장을 벗기고 게임 시장을 입힌다
 *  5) 액면분할                               — 30년 뒤 주당 수천만원이 되는 것을 막는다
 *
 * 출력
 *   data/manifest.json   전체 창 목록 + 게임 지수 + 연표   (게임이 항상 로드)
 *   data/w/<wid>.json    창별 OHLCV                        (추첨된 것만 로드)
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIVERSE, indexFor } from './universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data');
const WDIR = join(OUT, 'w');

const DPY = 250;
const WARMUP = 250;                 // 게임 시작 시 이미 보이는 과거 1년
const PLAY = 30 * DPY;              // 플레이 구간 7,500일 = 30년
const TOTAL = WARMUP + PLAY;        // 7,750
const START_PRICE = 50000;
const SEED = 19940415;

const DAY_CLAMP = 0.10, CUM_CLAMP = 1.10;
const SPLIT_TRIGGER = 200000, SPLIT_RATIO = 5;
const SHIFT_RANGE = 500, SHIFT_STEP = 50;
const MULTI_MIN_SLACK = 2000;       // 이만큼 여유가 있으면 창 2개 (8년 차이)
const MULTI_MIN_GAP = 2000;         // 두 창의 오프셋 최소 간격

/* ─────────────────────────── 연표 (플레이 구간 기준 일수) */
const BASE_ANCHORS = [
  [0,    850],    // 워밍업 시작
  [250, 1000],    // 플레이 시작
  [1750, 2400],   // ┐ 통화 위기
  [1900, 1560],   // │
  [2050, 1900],   // ┘
  [3000, 5200],   // ┐ 대붕괴
  [3550, 2500],   // │
  [3750, 2700],   // ┘
  [5050, 5600],   // ┐ 신용 경색
  [5350, 2800],   // │
  [5625, 3600],   // ┘
  [7000, 8200],   // ┐ 팬데믹 쇼크
  [7040, 5400],   // │
  [7225, 8000],   // ┘
  [7750, 11000],  // 종료
];
const SEG_VOL = [0.12, 0.14, 0.35, 0.28, 0.19, 0.32, 0.26, 0.14, 0.40, 0.30, 0.13, 0.60, 0.35, 0.19];

const CRASH_GROUPS = [
  { key: 'fx',       name: '통화 위기',   model: '1997 아시아 외환위기', idx: [2, 3, 4],    w: 1.0 },
  { key: 'bust',     name: '대붕괴',      model: '2000-2002 닷컴 붕괴',  idx: [5, 6, 7],    w: 1.6 },
  { key: 'credit',   name: '신용 경색',   model: '2008 서브프라임',      idx: [8, 9, 10],   w: 1.4 },
  { key: 'pandemic', name: '팬데믹 쇼크', model: '2020 코로나',          idx: [11, 12, 13], w: 0.8 },
];
const BULL_ERAS = [
  { key: 'bull1', name: '대세 상승기', model: '1990년대 초중반 강세장' },
  { key: 'mania', name: '기술주 광풍', model: '1998-2000 닷컴 버블' },
  { key: 'bull2', name: '회복과 과열', model: '2003-2007 강세장' },
  { key: 'bull3', name: '장기 상승장', model: '2009-2020 강세장' },
  { key: 'bull4', name: '유동성 랠리', model: '2020-2021 랠리' },
];

function applyShifts(shifts) {
  const a = BASE_ANCHORS.map(([d, l]) => [d, l]);
  CRASH_GROUPS.forEach((g, gi) => { for (const i of g.idx) a[i][0] += shifts[gi]; });
  const n = a.length;
  for (let i = 2; i < n - 1; i++) a[i][0] = Math.max(a[i][0], a[i - 1][0] + 80);
  for (let i = n - 2; i >= 2; i--) a[i][0] = Math.min(a[i][0], a[i + 1][0] - 80);
  a[n - 1][0] = TOTAL;
  return a;
}
const crashWindowsFrom = (a) =>
  CRASH_GROUPS.map((g) => ({ key: g.key, name: g.name, a: a[g.idx[0]][0], b: a[g.idx[1]][0], w: g.w }));

function erasFrom(a) {
  const out = [];
  let cur = 0;
  CRASH_GROUPS.forEach((g, gi) => {
    out.push({ ...BULL_ERAS[gi], a: cur, b: a[g.idx[0]][0], tone: 'bull' });
    out.push({ key: g.key, name: g.name, model: g.model, a: a[g.idx[0]][0], b: a[g.idx[2]][0], tone: 'crash' });
    cur = a[g.idx[2]][0];
  });
  out.push({ ...BULL_ERAS[4], a: cur, b: TOTAL, tone: 'bull' });
  return out.filter((e) => e.b > e.a);
}

/* ─────────────────────────── 유틸 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rand) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return u * m;
  };
}
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/**
 * 창/종목 식별자를 불투명한 코드로 바꾼다.
 * 파일명과 매니페스트에서 실제 티커가 드러나면 익명화가 무의미해진다.
 * 고정 솔트라 다시 빌드해도 코드가 같아 진행 중인 세이브가 깨지지 않는다.
 */
const CODE_SALT = 'stock-legends-v1';
function codeOf(s) {
  let h = 2166136261 >>> 0;
  const str = `${CODE_SALT}|${s}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).padStart(7, '0').slice(-7);
}
const seenCodes = new Set();
const WITH_RAW = process.env.WITH_RAW === '1';   // 원본 비교선 포함 빌드 (?debug=1 용)
const won = (v) => Math.round(v).toLocaleString('ko-KR');

/* ─────────────────────────── 게임 지수 */
function buildGameIndex(anchors) {
  const rand = mulberry32(SEED), normal = makeNormal(rand);
  const ret = new Float64Array(TOTAL + 1);
  for (let s = 0; s < anchors.length - 1; s++) {
    const [d0, l0] = anchors[s], [d1, l1] = anchors[s + 1];
    const n = d1 - d0;
    if (n <= 0) continue;
    const drift = Math.log(l1 / l0) / n, sd = (SEG_VOL[s] ?? 0.15) / Math.sqrt(DPY);
    const z = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { z[i] = normal() * sd; sum += z[i]; }
    const mean = sum / n;
    for (let i = 0; i < n; i++) if (d0 + i + 1 <= TOTAL) ret[d0 + i + 1] = drift + (z[i] - mean);
  }
  const level = new Float64Array(TOTAL + 1);
  level[0] = anchors[0][1];
  for (let t = 1; t <= TOTAL; t++) level[t] = level[t - 1] * Math.exp(ret[t]);
  return { ret, level };
}

/* ─────────────────────────── 베타 */
function computeReturnsAndBeta(rows, idxByDate) {
  const n = rows.length;
  const rs = new Float64Array(n), rm = new Float64Array(n);
  let last = null;
  for (let i = 0; i < n; i++) {
    const v = idxByDate.get(rows[i].d) ?? last;
    if (i > 0) {
      rs[i] = Math.log(rows[i].c / rows[i - 1].c);
      rm[i] = (v != null && last != null) ? Math.log(v / last) : 0;
    }
    if (v != null) last = v;
  }
  const W = 250, beta = new Float64Array(n);
  let sX = 0, sY = 0, sXX = 0, sXY = 0, cnt = 0;
  for (let i = 1; i < n; i++) {
    sX += rm[i]; sY += rs[i]; sXX += rm[i] * rm[i]; sXY += rm[i] * rs[i]; cnt++;
    if (cnt > W) { const j = i - W; sX -= rm[j]; sY -= rs[j]; sXX -= rm[j] * rm[j]; sXY -= rm[j] * rs[j]; cnt--; }
    if (cnt >= 30) {
      const cov = sXY / cnt - (sX / cnt) * (sY / cnt), vm = sXX / cnt - (sX / cnt) ** 2;
      beta[i] = vm > 1e-12 ? clamp(cov / vm, 0.3, 2.0) : 1.0;
    } else beta[i] = 1.0;
  }
  const fv = beta[Math.min(W, n - 1)] || 1.0;
  for (let i = 0; i < Math.min(W, n); i++) beta[i] = fv;
  return { rm, beta };
}

/* ─────────────────────────── 창 선택 */
const logCloses = (rows) => Float64Array.from(rows, (r) => Math.log(r.c));

/**
 * 캔들 품질 누적합.
 *
 * 1980~90년대 일본 ADR처럼 거래가 뜸한 구간은 OHLC가 제대로 안 채워져 있다.
 * 시가=종가인 날이 30%씩 나오고 고가만 따로 찍혀서 "몸통 없이 윗꼬리만 긴 캔들"이 된다.
 * 오버레이는 하루 전체에 같은 배수를 곱하므로 이 등호 관계가 그대로 보존된다 → 원본에서 걸러야 한다.
 *
 * 측정 분포(67창): flat 중앙 0.0%/상위10% 1.0%, 시가=종가 중앙 4.7%/상위10% 9.8%,
 *                  꼬리없음 중앙 약 16.5%/상위10% 약 31%
 */
function qualityPrefix(rows) {
  const n = rows.length, E = 1e-9;
  const flat = new Int32Array(n + 1), noBody = new Int32Array(n + 1);
  const noUp = new Int32Array(n + 1), noDn = new Int32Array(n + 1);
  const range = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const { o, h, l, c } = rows[i];
    flat[i + 1]   = flat[i]   + (h - l < E ? 1 : 0);                 // 하루 종일 한 가격
    noBody[i + 1] = noBody[i] + (Math.abs(c - o) < E ? 1 : 0);       // 시가=종가
    noUp[i + 1]   = noUp[i]   + (h - Math.max(o, c) < E ? 1 : 0);    // 윗꼬리 없음
    noDn[i + 1]   = noDn[i]   + (Math.min(o, c) - l < E ? 1 : 0);    // 아랫꼬리 없음
    range[i + 1]  = range[i]  + (h - l) / c;                         // 일간 고저폭
  }
  return { flat, noBody, noUp, noDn, range };
}

/**
 * 기준값은 tools/sweep-quality.mjs 로 비용을 재고 정했다.
 *   느슨(0.03/0.15/0.45) → 64창·43종목, 일본 9창
 *   엄격(0.015/0.10/0.30) → 59창·41종목, 일본 4창, 고마츠·닛산 탈락   ← 채택
 * 미국·한국은 어느 기준에서도 줄지 않는다. 비용은 전적으로 일본이 치른다.
 *
 * minRange(최소 일간 변동폭)는 넣지 않는다.
 *   1.2%는 추가 효과가 0이고 1.5%는 도요타·혼다까지 잘라 일본이 사실상 사라진다.
 *   게다가 저변동은 결함이 아니라 β 학습 소재다 (미국 방어주도 1.35~1.44%).
 */
const num = (k, d) => (process.env[k] != null ? +process.env[k] : d);
const QUALITY = {
  flat:     num('QG_FLAT', 0.015),
  noBody:   num('QG_NOBODY', 0.10),
  noUp:     num('QG_NOUP', 0.30),
  noDn:     num('QG_NODN', 0.30),
  minRange: num('QG_MINRANGE', 0),
};

// 밴드를 못 맞춰 폴백하더라도 이 배수를 넘으면 종목을 통째로 버린다.
// 8종목 유니버스에 수천 배짜리가 하나 끼면 나머지 판단이 전부 무의미해진다.
const HARD_MAX_MULT = 300;

/**
 * 총수익 밴드를 만족하면서 위기 정렬이 가장 좋은 30년 창을 찾는다.
 * exclude: 이미 뽑은 오프셋들. MULTI_MIN_GAP 이내는 후보에서 뺀다 (같은 종목의 두 창이 닮지 않도록)
 */
function findBestOffset(L, windows, band, exclude = [], q = null) {
  const maxOff = L.length - TOTAL - 1;
  if (maxOff < 0) return null;
  const [lo, hi] = band ?? [0, Infinity];
  const logLo = Math.log(lo || 1e-9), logHi = Math.log(hi);
  const len = TOTAL + 1;
  let best = null, fallback = null, nOk = 0, nQualityOk = 0;

  for (let o = 0; o <= maxOff; o++) {
    if (exclude.some((e) => Math.abs(o - e) < MULTI_MIN_GAP)) continue;
    if (q) {
      const frac = (p) => (p[o + len] - p[o]) / len;
      if (frac(q.flat) > QUALITY.flat || frac(q.noBody) > QUALITY.noBody
          || frac(q.noUp) > QUALITY.noUp || frac(q.noDn) > QUALITY.noDn) continue;
      if (QUALITY.minRange > 0 && frac(q.range) < QUALITY.minRange) continue;
      nQualityOk++;
    }
    const total = L[o + TOTAL] - L[o];
    let score = 0;
    for (const w of windows) score += w.w * ((L[o + w.b] - L[o + w.a]) - total * (w.b - w.a) / TOTAL);
    const cand = { offset: o, score, mult: Math.exp(total) };
    if (!fallback || score < fallback.score) fallback = cand;
    if (total >= logLo && total <= logHi) { nOk++; if (!best || score < best.score) best = cand; }
  }
  if (!best && !fallback) return null;   // 품질 게이트를 통과하는 창이 하나도 없음
  return { ...(best ?? fallback), slack: maxOff, banded: !!best, nOk, nQualityOk };
}

/** 위기 캘린더와 종목 창을 함께 최적화 (좌표 하강) */
function optimizeCalendar(pool) {
  const evaluate = (shifts) => {
    const anchors = applyShifts(shifts);
    const windows = crashWindowsFrom(anchors);
    let total = 0;
    for (const u of pool) {
      const r = findBestOffset(u.L, windows, u.band, [], u.q);
      if (!r) continue;
      total += r.score + (r.banded ? 0 : 20);
    }
    return { total, anchors, windows };
  };
  let shifts = [0, 0, 0, 0], best = evaluate(shifts);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let g = 0; g < CRASH_GROUPS.length; g++) {
      for (let s = -SHIFT_RANGE; s <= SHIFT_RANGE; s += SHIFT_STEP) {
        const trial = shifts.slice(); trial[g] = s;
        const r = evaluate(trial);
        if (r.total < best.total - 1e-9) { best = r; shifts = trial; improved = true; }
      }
    }
    if (!improved) break;
  }
  return { shifts, ...best };
}

/* ─────────────────────────── 오버레이 + 분할 */
function applyOverlay(rows, offset, beta, rm, gameRet) {
  const lk = new Float64Array(TOTAL + 1);
  for (let t = 1; t <= TOTAL; t++) {
    const j = offset + t;
    lk[t] = clamp(beta[j] * (gameRet[t] - rm[j]), -DAY_CLAMP, DAY_CLAMP);
  }
  const cum = new Float64Array(TOTAL + 1);
  for (let t = 1; t <= TOTAL; t++) cum[t] = cum[t - 1] + lk[t];
  const end = cum[TOTAL];
  const A = new Float64Array(TOTAL + 1);
  for (let t = 0; t <= TOTAL; t++) A[t] = Math.exp(clamp(cum[t] - end * (t / TOTAL), -CUM_CLAMP, CUM_CLAMP));

  const raw = { o: [], h: [], l: [], c: [], v: [] };
  const ovl = { o: [], h: [], l: [], c: [], v: [] };
  const scale = START_PRICE / rows[offset].c;
  for (let t = 0; t <= TOTAL; t++) {
    const r = rows[offset + t], a = A[t];
    // 가격은 정수(원)로 저장한다. 창 내 최저가가 수천 원대라 반올림 오차는 0.01% 미만이고,
    // 소수점 두 자리를 빼면 파일이 25% 줄어든다
    raw.o.push(Math.round(r.o * scale)); raw.h.push(Math.round(r.h * scale));
    raw.l.push(Math.round(r.l * scale)); raw.c.push(Math.round(r.c * scale));
    raw.v.push(Math.round(r.v));
    const vm = 1 + clamp(Math.abs(lk[t]) / 0.02, 0, 2);
    ovl.o.push(Math.round(r.o * scale * a)); ovl.h.push(Math.round(r.h * scale * a));
    ovl.l.push(Math.round(r.l * scale * a)); ovl.c.push(Math.round(r.c * scale * a));
    ovl.v.push(Math.round(r.v * vm));
  }
  // 정수 반올림으로 고가/저가가 몸통 밖으로 나가는 경우를 바로잡는다
  for (const k of [raw, ovl]) {
    for (let t = 0; t <= TOTAL; t++) {
      k.h[t] = Math.max(k.h[t], k.o[t], k.c[t]);
      k.l[t] = Math.max(1, Math.min(k.l[t], k.o[t], k.c[t]));
    }
  }
  normalizeVolume(raw); normalizeVolume(ovl);
  return { raw, ovl };
}

/** 거래량은 상대 크기(평균 대비 몇 배)로만 쓴다. 중앙값 1000 기준으로 줄여 자릿수를 없앤다 */
function normalizeVolume(k) {
  const s = [...k.v].sort((a, b) => a - b);
  const med = s[s.length >> 1] || 1;
  for (let i = 0; i < k.v.length; i++) k.v[i] = Math.max(1, Math.round((k.v[i] / med) * 1000));
}

/** 일간 차분. 이웃한 날의 가격 차이는 작아서 자릿수가 절반으로 준다 */
const deltaEnc = (a) => {
  const r = new Array(a.length);
  r[0] = a[0];
  for (let i = 1; i < a.length; i++) r[i] = a[i] - a[i - 1];
  return r;
};
/** 게임이 받을 형태로 포장. 거래량은 노이즈가 커서 차분해도 이득이 없어 그대로 둔다 */
const pack = (k) => ({
  o: deltaEnc(k.o), h: deltaEnc(k.h), l: deltaEnc(k.l), c: deltaEnc(k.c),
  v: k.v, splits: k.splits, enc: 'd1',
});

/** 분할 일정. 가격은 연속 단위로 두고 날짜별 누적배수만 만든다 */
function computeSplits(c) {
  const splits = [];
  let div = 1;
  for (let t = 0; t < c.length; t++) {
    while (c[t] / div > SPLIT_TRIGGER) { div *= SPLIT_RATIO; splits.push({ day: t, ratio: SPLIT_RATIO }); }
  }
  return splits;
}

function stats(s) {
  const c = s.c;
  let peak = c[0], mdd = 0, hi = 0;
  for (const p of c) {
    if (p > peak) peak = p;
    const dd = p / peak - 1;
    if (dd < mdd) mdd = dd;
    if (p / c[0] > hi) hi = p / c[0];
  }
  return { mult: c[c.length - 1] / c[0], peak: hi, mdd };
}

/* ─────────────────────────── 메인 */
async function main() {
  // 참조 지수
  const idxMaps = {};
  for (const id of ['SPX', 'KOSPI']) {
    const rows = JSON.parse(await readFile(join(RAW, `${id}.json`), 'utf8')).rows;
    idxMaps[id] = new Map(rows.map((r) => [r.d, r.c]));
  }

  // 종목 적재 + 길이 검증
  const pool = [], dropped = [];
  for (const u of UNIVERSE) {
    let rows;
    try { rows = JSON.parse(await readFile(join(RAW, `${u.id}.json`), 'utf8')).rows; }
    catch { dropped.push(`${u.name}(파일없음)`); continue; }
    if (rows.length < TOTAL + 1) { dropped.push(`${u.name}(${TOTAL + 1 - rows.length}봉 부족)`); continue; }
    const { rm, beta } = computeReturnsAndBeta(rows, idxMaps[indexFor(u)]);
    pool.push({ ...u, rows, L: logCloses(rows), rm, beta, q: qualityPrefix(rows),
                slack: rows.length - TOTAL - 1 });
  }
  if (dropped.length) console.log(`제외 ${dropped.length}종목: ${dropped.join(', ')}\n`);

  // 위기 캘린더 최적화
  console.log(`위기 캘린더 최적화 (${pool.length}종목 대상)…`);
  const opt = optimizeCalendar(pool);
  CRASH_GROUPS.forEach((g, i) => {
    const w = opt.windows[i];
    console.log(`  ${g.name.padEnd(12)} ${opt.shifts[i] >= 0 ? '+' : ''}${opt.shifts[i]}일  →  플레이 ` +
      `${((w.a - WARMUP) / DPY).toFixed(1)}~${((w.b - WARMUP) / DPY).toFixed(1)}년차`);
  });

  const game = buildGameIndex(opt.anchors);
  const eras = erasFrom(opt.anchors);

  await rm(WDIR, { recursive: true, force: true });
  await mkdir(WDIR, { recursive: true });

  const manifest = [], skippedSecondary = [], qualityDropped = [];
  let bandFail = 0, bytes = 0;
  console.log('\n창ID              종목            유형    β     오프셋  여유   실제기간                  30년수익  최고점    MDD    분할');
  console.log('─'.repeat(126));

  for (const u of pool) {
    const nWin = u.slack >= MULTI_MIN_SLACK ? 2 : 1;
    const used = [];
    for (let k = 0; k < nWin; k++) {
      const pick = findBestOffset(u.L, opt.windows, u.band, used, u.q);
      if (!pick) { if (k === 0) qualityDropped.push(u.name); break; }
      if (pick.mult > HARD_MAX_MULT) {
        if (k === 0) qualityDropped.push(`${u.name}(${pick.mult.toFixed(0)}배 · 상한 초과)`);
        break;
      }
      // 1번째 창은 밴드를 못 맞춰도 만든다(종목당 최소 1개는 있어야 함).
      // 2번째 창은 밴드를 못 맞추면 만들지 않는다 — 극단적 배수의 창이 딸려 들어오는 걸 막는다.
      if (k > 0 && !pick.banded) { skippedSecondary.push(`${u.name}(${pick.mult.toFixed(0)}배)`); break; }
      used.push(pick.offset);
      const wid = `${u.id}-w${k + 1}`;   // 파일명 겸 URL 경로. '#'은 프래그먼트로 잘리므로 쓰지 않는다
      const { raw, ovl } = applyOverlay(u.rows, pick.offset, u.beta, u.rm, game.ret);
      raw.splits = computeSplits(raw.c);
      ovl.splits = computeSplits(ovl.c);

      let bsum = 0;
      for (let t = 0; t <= TOTAL; t++) bsum += u.beta[pick.offset + t];
      const beta = +(bsum / (TOTAL + 1)).toFixed(2);
      const sr = stats(raw), so = stats(ovl);
      const code = codeOf(wid), grp = codeOf(u.id);
      if (seenCodes.has(code)) throw new Error(`코드 충돌: ${wid} → ${code}`);
      seenCodes.add(code);

      const meta = {
        code, wid, id: u.id, name: u.name, mkt: u.mkt, archetype: u.archetype, beta,
        realFrom: u.rows[pick.offset].d, realTo: u.rows[pick.offset + TOTAL].d,
        offset: pick.offset, mult: +sr.mult.toFixed(2), peak: +so.peak.toFixed(2),
        mdd: +so.mdd.toFixed(3), banded: pick.banded,
      };
      // 매니페스트에는 추첨에 꼭 필요한 것만 남긴다.
      // 실명·실제기간·수익배수는 창 파일 안에만 두어, 개발자 도구로 정답을 미리 못 보게 한다.
      manifest.push({ code, grp, mkt: u.mkt, archetype: u.archetype });
      if (!pick.banded) bandFail++;

      // raw(원본 비교선)는 ?debug=1 전용이라 기본 빌드에서 뺀다. 파일의 정확히 절반이다
      const json = JSON.stringify(WITH_RAW ? { ...meta, raw: pack(raw), ovl: pack(ovl) }
                                           : { ...meta, ovl: pack(ovl) });
      bytes += json.length;
      await writeFile(join(WDIR, `${code}.json`), json);

      console.log(
        `${wid.padEnd(16)}  ${u.name.padEnd(14)} ${u.archetype.padEnd(6)} ${String(beta).padStart(4)}  ` +
        `${String(pick.offset).padStart(5)}  ${String(u.slack).padStart(5)}  ` +
        `${meta.realFrom}~${meta.realTo}  ${sr.mult.toFixed(1).padStart(7)}배 ${so.peak.toFixed(1).padStart(6)}배 ` +
        `${(so.mdd * 100).toFixed(0).padStart(5)}%  ${ovl.splits.length}회${pick.banded ? '' : '  ⚠밴드미달'}`
      );
    }
  }

  const manifestJson = JSON.stringify({
    meta: { warmup: WARMUP, playDays: PLAY, totalDays: TOTAL, daysPerYear: DPY,
            startPrice: START_PRICE, seed: SEED, shifts: opt.shifts, builtAt: new Date().toISOString() },
    eras, crashWindows: opt.windows,
    index: Array.from(game.level, (v) => +v.toFixed(2)),
    windows: manifest,
  });
  await writeFile(join(OUT, 'manifest.json'), manifestJson);

  const byArch = {};
  for (const m of manifest) byArch[m.archetype] = (byArch[m.archetype] || 0) + 1;
  if (skippedSecondary.length)
    console.log(`\n2번째 창 생략 (밴드 초과): ${skippedSecondary.join(', ')}`);
  if (qualityDropped.length)
    console.log(`품질 게이트 탈락 (쓸 만한 구간 없음): ${qualityDropped.join(', ')}`);
  console.log(`\n창 ${manifest.length}개 (종목 ${pool.length})  밴드 미달 ${bandFail}개`);
  console.log('유형별: ' + Object.entries(byArch).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`게임 지수: ${game.level[WARMUP].toFixed(0)} → ${game.level[TOTAL].toFixed(0)} ` +
    `(${((game.level[TOTAL] / game.level[WARMUP]) ** (1 / 30) * 100 - 100).toFixed(2)}%/년)`);
  console.log(`manifest.json ${(manifestJson.length / 1024).toFixed(0)}KB · 창 파일 합계 ${(bytes / 1024 / 1024).toFixed(1)}MB ` +
    `(추첨된 것만 로드하므로 실제 다운로드는 창 1개당 약 ${(bytes / manifest.length / 1024).toFixed(0)}KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
