# 배포 가이드 (GitHub Pages + Supabase)

카카오톡 단톡방에 링크로 뿌리는 것을 전제로 한 절차입니다.

---

## 지금 막혀 있는 것

배포에 필요한 두 가지가 **계정 인증이 필요한 작업**이라 대신 처리할 수 없습니다.

| 항목 | 상태 | 필요한 조치 |
|---|---|---|
| GitHub 저장소 | `gh` CLI 미로그인 | `gh auth login` 또는 웹에서 빈 저장소 생성 |
| Supabase 프로젝트 | **`xzynjhfqnputueclkysx` 가 사라짐** (DNS 조회 실패) | 새 프로젝트 생성 후 URL·키 전달 |

> Pulse Grid가 쓰던 Supabase 프로젝트가 삭제된 상태입니다.
> `goatfrog94.github.io/pulse-grid` 페이지 자체는 살아 있지만 리더보드는 지금 동작하지 않을 겁니다.
> 새 프로젝트를 만들면 두 게임 모두 다시 연결하면 됩니다.

---

## 1. GitHub Pages

### 올릴 것 / 올리지 말 것

```
stock-legends/
├─ index.html          ← 올림 (112KB)
├─ data/
│   ├─ manifest.json   ← 올림 (68KB)
│   └─ w/*.json        ← 올림 (창 55개, 합계 10.6MB)
├─ tools/              ← 올림 (게임 실행엔 불필요하지만 재생성용)
└─ data/raw/           ← 올리지 않음 (원본 시세 41MB, `.gitignore` 처리됨)
```

### 용량

| 항목 | 크기 |
|---|---|
| 저장소 전체 | **10.6MB** (Pages 권장 상한 1GB) |
| 첫 접속 | `index.html` + `manifest.json` ≈ 60KB (gzip) |
| 한 판 시작 | 창 6~10개 × 86KB(gzip) = **약 520KB ~ 860KB** |

GitHub Pages가 JSON을 gzip으로 보내므로 실제 전송량은 위 값입니다.
`새 판`을 누르면 새로 뽑힌 창만 다시 받습니다.

### 절차

로컬 저장소와 첫 커밋은 이미 만들어져 있습니다. 남은 것은 원격 연결뿐입니다.

```bash
gh auth login
```

인증 후 저장소 생성과 푸시를 한 번에:

```bash
cd stock-legends && gh repo create stock-legends --public --source=. --remote=origin --push
```

`gh` 없이 웹에서 빈 저장소를 만든 경우:

```bash
cd stock-legends && git branch -M main && git remote add origin https://github.com/goatfrog94/stock-legends.git && git push -u origin main
```

마지막으로 저장소 **Settings → Pages → Source: `main` / `/ (root)`** 를 지정하면
`https://goatfrog94.github.io/stock-legends/` 에서 열립니다.

> 모든 경로가 상대경로라 하위 경로 배포에서도 그대로 동작합니다.

---

## 2. Supabase 리더보드

연결하지 않아도 게임은 정상 동작합니다. 그 경우 기록이 **각자 브라우저에만** 남습니다.

### 2-1. 테이블 만들기

새 프로젝트를 만든 뒤, `supabase_setup.sql` 전체를 SQL Editor에 붙여넣고 **Run** 한 번이면 끝입니다.
테이블명은 `stock_legends_scores` 이고, 다른 게임과 같은 프로젝트를 공유해도 충돌하지 않습니다.

### 2-2. 게임에 연결

`index.html`에서 `SB` 를 찾아 채웁니다.

```js
const SB = {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  key: 'sb_publishable_...',          // Project Settings → API
  table: 'stock_legends_scores',
};
```

`publishable`(구 `anon`) 키는 **클라이언트에 노출되는 게 정상**입니다. 실제 방어선은 RLS입니다.
`service_role` 키는 절대 넣지 마세요.

### 2-3. 조작에 대해

브라우저에서 직접 POST를 날리면 아무 점수나 넣을 수 있습니다.
RLS는 "말이 안 되는 값"만 막을 뿐, 작정한 조작은 막지 못합니다.
단톡방 친구들끼리 하는 재미 목적이면 이 정도가 적정선입니다.

정 신경 쓰이면 `seed` 컬럼이 저장되므로, 의심스러운 기록은 같은 시드로 돌려보면 검증됩니다.

---

## 3. 데이터 저작권

원본은 Yahoo Finance(미국 상장)와 네이버 금융(KRX)에서 받았습니다.
게임에 실리는 데이터는 다음을 거쳐 **원본 시계열이 아닙니다.**

1. 종목명을 4자 의태어 가명으로 치환 (흐지부지·얼렁뚱땅…)
2. 시작가를 5만원으로 정규화 — 실제 주가 수준 제거
3. 매크로 오버레이 — 원래 시장 흐름을 벗기고 게임 시장을 입힘
4. 실제 날짜를 게임 연차로 치환
5. 가격 정수 반올림 + 거래량 상대값 정규화

`manifest.json`과 파일명은 **완전히 익명**입니다(불투명 코드).
실명과 실제 기간은 추첨된 창 파일 안에만 있고, 엔딩 공개에 쓰입니다.

상업적 이용은 각 소스의 이용약관을 확인하세요. 지인 대상 비상업 배포를 전제로 한 구성입니다.

---

## 4. 배포 전 점검

```bash
node tools/build-game-data.mjs && node tools/serve.mjs
```

- [ ] 새 판이 정상적으로 뽑히는가
- [ ] 새로고침 후 `이어하기`가 뜨고 자산·보유가 그대로인가
- [ ] 30년 끝까지 돌려 엔딩 리포트가 뜨는가
- [ ] `종목 정체` 탭에 실명이 나오는가
- [ ] 리더보드 등록이 되는가
- [ ] `data/raw/`가 커밋되지 않았는가
