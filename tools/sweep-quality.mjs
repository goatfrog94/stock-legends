/**
 * 품질 게이트 기준을 바꿔가며 "뭘 잃는지" 잰다.
 * 데이터 파일은 건드리지 않고(임시 출력) 요약만 뽑는다.
 */
import { spawnSync } from 'node:child_process';
import { readFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const MANIFEST = join(ROOT, 'data', 'manifest.json');
const BACKUP = join(ROOT, 'data', 'manifest.backup.json');

const SETTINGS = [
  { label: '현재 (느슨)',            env: {} },
  { label: '엄격 (모양만)',          env: { QG_FLAT: '0.015', QG_NOBODY: '0.10', QG_NOUP: '0.30', QG_NODN: '0.30' } },
  { label: '엄격 + 최소변동 1.2%',   env: { QG_FLAT: '0.015', QG_NOBODY: '0.10', QG_NOUP: '0.30', QG_NODN: '0.30', QG_MINRANGE: '0.012' } },
  { label: '엄격 + 최소변동 1.5%',   env: { QG_FLAT: '0.015', QG_NOBODY: '0.10', QG_NOUP: '0.30', QG_NODN: '0.30', QG_MINRANGE: '0.015' } },
];

await cp(MANIFEST, BACKUP);
const results = [];

for (const s of SETTINGS) {
  const r = spawnSync(process.execPath, [join(TOOLS, 'build-game-data.mjs')],
    { env: { ...process.env, ...s.env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(s.label, r.stderr?.slice(0, 400)); continue; }
  const m = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const w = m.windows;
  const byMkt = {}, byArch = {}, ids = new Set();
  for (const x of w) { byMkt[x.mkt] = (byMkt[x.mkt] || 0) + 1; byArch[x.archetype] = (byArch[x.archetype] || 0) + 1; ids.add(x.id); }
  const dropLine = (r.stdout.match(/품질 게이트 탈락[^\n]*/) || [''])[0];
  results.push({ label: s.label, 창: w.length, 종목: ids.size, byMkt, byArch, dropLine, ids });
}

// 원래 상태로 되돌린다
await cp(BACKUP, MANIFEST);
await rm(BACKUP);

console.log('\n' + '═'.repeat(96));
console.log('기준                    창   종목   US  KR  JP   방어  폭발  우상향  붕괴  쇠퇴  사이클');
console.log('─'.repeat(96));
for (const r of results) {
  const a = r.byArch, m = r.byMkt;
  console.log(`${r.label.padEnd(22)} ${String(r.창).padStart(3)}  ${String(r.종목).padStart(4)}   ` +
    `${String(m.US || 0).padStart(2)}  ${String(m.KR || 0).padStart(2)}  ${String(m.JP || 0).padStart(2)}   ` +
    `${String(a['방어형'] || 0).padStart(3)}  ${String(a['폭발형'] || 0).padStart(3)}  ${String(a['우상향형'] || 0).padStart(5)}  ` +
    `${String(a['붕괴형'] || 0).padStart(3)}  ${String(a['쇠퇴형'] || 0).padStart(3)}  ${String(a['사이클형'] || 0).padStart(5)}`);
}

console.log('\n── 기준을 올리면 사라지는 종목 ──');
const base = results[0].ids;
for (const r of results.slice(1)) {
  const lost = [...base].filter((id) => !r.ids.has(id));
  console.log(`\n${r.label}: 종목 ${base.size} → ${r.ids.size}`);
  console.log(`  사라짐(${lost.length}): ${lost.length ? lost.join(', ') : '없음'}`);
  if (r.dropLine) console.log(`  ${r.dropLine}`);
}
console.log('\n※ 쿼터는 승자군 2·패자군 2·방어형 1·한국 1·일본 1을 요구한다.');
console.log('  해당 칸이 2~3 이하로 내려가면 매 판 같은 종목만 반복해서 뽑히게 된다.');
