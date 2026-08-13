/** 저장된 원본 데이터 검사 — 재수집 없이 30년 확보 여부와 결측 밀도를 본다 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIVERSE } from './universe.mjs';

const RAW = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'raw');
const NEED = 7751, MIN_DENSITY = 230;

const ok = [], bad = [];
for (const mkt of ['US', 'KR', 'JP']) {
  console.log(`\n── ${mkt} ──`);
  for (const u of UNIVERSE.filter((x) => x.mkt === mkt)) {
    let rows;
    try { rows = JSON.parse(await readFile(join(RAW, `${u.id}.json`), 'utf8')).rows; }
    catch { console.log(`  ✗ ${u.name.padEnd(16)} 파일 없음`); bad.push(u.name); continue; }
    const yrs = (Date.parse(rows.at(-1).d) - Date.parse(rows[0].d)) / 31557600000;
    const density = rows.length / yrs;
    const slack = rows.length - NEED;
    const short = slack < 0, sparse = density < MIN_DENSITY;
    const note = short ? `  ← 30년 부족 (${-slack}봉)` : sparse ? `  ← 결측 많음 (연 ${density.toFixed(0)}일)` : '';
    console.log(`  ${short || sparse ? '⚠' : '✓'} ${u.name.padEnd(16)} ${String(rows.length).padStart(6)}봉 ` +
      `여유 ${String(Math.max(0, slack)).padStart(5)}  연${density.toFixed(0)}일  ` +
      `${rows[0].d}~${rows.at(-1).d}  ${(rows.at(-1).c / rows[0].c).toFixed(1).padStart(8)}배${note}`);
    (short || sparse ? bad : ok).push(u.name);
  }
}
console.log(`\n사용 가능 ${ok.length}종목 / 제외 ${bad.length}종목`);
if (bad.length) console.log(`제외: ${bad.join(', ')}`);
// 다중 창(오프셋 8년 이상 벌리기) 가능 종목
console.log('\n── 다중 창 가능 (여유 2,000봉=8년 이상) ──');
let multi = 0;
for (const u of UNIVERSE) {
  try {
    const rows = JSON.parse(await readFile(join(RAW, `${u.id}.json`), 'utf8')).rows;
    if (rows.length - NEED >= 2000) { multi++; process.stdout.write(`${u.name}(${((rows.length - NEED) / 250).toFixed(0)}년) `); }
  } catch {}
}
console.log(`\n→ ${multi}종목에서 창 2개씩 뽑으면 유니버스 ${ok.length + multi}개`);
