/**
 * 원본 데이터 수집기
 *
 *  · 미국 상장(미국 종목 + 일본 ADR) → Yahoo Finance chart API
 *  · 한국(KRX)                        → 네이버 금융 시세
 *
 * 가격 기준을 두 소스에서 반드시 통일해야 한다.
 *   Yahoo  quote.close  = 액면분할 반영 · 배당 미반영   ← 이걸 쓴다
 *   Yahoo  adjclose     = 분할 + 배당 반영              ← 쓰지 않는다
 *   네이버 수정주가      = 분할 반영 · 배당 미반영
 * adjclose를 쓰면 미국·일본 종목만 배당 재투자가 붙어 한국 종목이 부당하게 불리해진다.
 * 그래서 유니버스 전체를 "분할 반영 · 배당 제외" 기준으로 맞춘다.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIVERSE, INDICES, YAHOO, NAVER } from './universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'data', 'raw');

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=0&period2=9999999999&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!(res.headers.get('content-type') || '').includes('json')) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(JSON.stringify(j?.chart?.error)?.slice(0, 80) || 'no data');

  const ts = r.timestamp || [], q = r.indicators.quote[0];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if (c == null || !(c > 0) || o == null || h == null || l == null) continue;
    rows.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10),
                o: +o.toFixed(6), h: +h.toFixed(6), l: +l.toFixed(6), c: +c.toFixed(6), v: v ?? 0 });
  }
  return rows;
}

async function fetchNaver(symbol) {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(symbol)}`
    + `&requestType=1&startTime=19900101&endTime=20991231&timeframe=day`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' } });
  const text = (await res.text()).trim();
  if (!text.startsWith('[')) throw new Error(`HTTP ${res.status}`);
  // 느슨한 JS 배열: 키 따옴표 없음 + 후행 쉼표
  const arr = JSON.parse(text.replace(/'/g, '"').replace(/,\s*\]/g, ']'));
  const rows = [];
  for (const r of arr.slice(1)) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const [d, o, h, l, c, v] = r;
    if (!(c > 0) || !(o > 0)) continue;
    const s = String(d);
    rows.push({ d: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
                o: +o, h: +h, l: +l, c: +c, v: +v || 0 });
  }
  return rows;
}

/** 휴장 채움행(거래량 0에 시가=고가=저가=종가) 제거 + OHLC 정합성 보정 */
function clean(rows) {
  const out = [];
  for (const r of rows) {
    const flat = r.o === r.h && r.h === r.l && r.l === r.c;
    if (flat && r.v === 0) continue;
    r.h = Math.max(r.h, r.o, r.c);
    r.l = Math.min(r.l, r.o, r.c);
    out.push(r);
  }
  return out;
}

const fetchers = { [YAHOO]: fetchYahoo, [NAVER]: fetchNaver };

async function grab(target) {
  const rows = clean(await fetchers[target.src](target.sym));
  if (!rows.length) throw new Error('빈 데이터');
  await writeFile(join(RAW_DIR, `${target.id}.json`),
    JSON.stringify({ id: target.id, sym: target.sym, name: target.name, src: target.src, rows }));
  const yrs = (Date.parse(rows[rows.length - 1].d) - Date.parse(rows[0].d)) / 31557600000;
  return {
    n: rows.length,
    density: rows.length / yrs,           // 연간 거래일 수. 230 미만이면 결측이 많은 종목이다
    line: `${String(rows.length).padStart(6)}봉 ${yrs.toFixed(1).padStart(5)}년  ` +
          `${rows[0].d}~${rows[rows.length - 1].d}  ${(rows[rows.length - 1].c / rows[0].c).toFixed(1).padStart(8)}배`,
  };
}

const NEED = 7751;      // 게임 30년(7,500) + 워밍업(250) + 1
const MIN_DENSITY = 230;

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const fails = [];

  console.log('── 참조 지수 ──');
  for (const ix of INDICES) {
    try { console.log(`  ${ix.name.padEnd(16)} ✓ ${(await grab(ix)).line}`); }
    catch (e) { console.log(`  ${ix.name.padEnd(16)} ✗ ${e.message}`); fails.push(ix.id); }
    await new Promise((r) => setTimeout(r, 200));
  }

  for (const mkt of ['US', 'KR', 'JP']) {
    const list = UNIVERSE.filter((u) => u.mkt === mkt);
    console.log(`\n── ${mkt} (${list.length}종목) ──`);
    for (const u of list) {
      try {
        const r = await grab(u);
        const short = r.n < NEED, sparse = r.density < MIN_DENSITY;
        const note = short ? `  ← 30년 부족 (${NEED - r.n}봉)` : sparse ? `  ← 결측 많음 (연 ${r.density.toFixed(0)}일)` : '';
        console.log(`  ${short || sparse ? '⚠' : '✓'} ${u.name.padEnd(16)} ${r.line}${note}`);
        if (short || sparse) fails.push(`${u.name}${note}`);
      } catch (e) { console.log(`  ✗ ${u.name.padEnd(16)} ${e.message}`); fails.push(u.name); }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\n저장 위치: ${RAW_DIR}`);
  if (fails.length) console.log(`⚠ 확인 필요 (${fails.length}건):\n   ` + fails.join('\n   '));
  else console.log('전 종목 30년 확보');
}

main().catch((e) => { console.error(e); process.exit(1); });
