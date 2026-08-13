# 배포 가이드 (GitHub Pages + Supabase)

카카오톡 단톡방에 링크로 뿌리는 것을 전제로 한 절차입니다.

---

## 1. GitHub Pages

### 올릴 것 / 올리지 말 것

```
stock-legends/
├─ index.html          ← 올림
├─ data/
│   ├─ manifest.json   ← 올림 (74KB)
│   └─ w/*.json        ← 올림 (창 64개, 합계 약 38MB)
├─ tools/              ← 올려도 되고 빼도 됨 (게임 실행에 불필요)
└─ data/raw/           ← 올리지 말 것 (원본 시세, 100MB+)
```

`data/raw/`는 반드시 `.gitignore` 하세요. 게임에 필요 없고, 원본 시세를 그대로 재배포하는 꼴이 됩니다.

```gitignore
data/raw/
node_modules/
```

### 용량

| 항목 | 크기 |
|---|---|
| 저장소 전체 | 약 38MB (GitHub Pages 권장 상한 1GB 이내) |
| 첫 접속 다운로드 | `manifest.json` 74KB |
| 한 판 시작 시 | 창 6~10개 × 약 600KB = **4~6MB** |

한 판당 4~6MB는 데스크톱에서는 문제없고, 모바일 데이터로는 다소 무겁습니다.
`새 판`을 누를 때마다 다시 받습니다.

### 절차

```bash
cd stock-legends
git init && git add -A && git commit -m "STOCK LEGENDS"
git branch -M main
git remote add origin https://github.com/<계정>/stock-legends.git
git push -u origin main
```

저장소 **Settings → Pages → Source: `main` / `/ (root)`** 로 설정하면
`https://<계정>.github.io/stock-legends/` 로 열립니다.

> 파일 경로가 상대경로(`data/manifest.json`)이므로 하위 경로 배포에서도 그대로 동작합니다.

---

## 2. Supabase 리더보드

연결하지 않아도 게임은 돌아갑니다. 그 경우 기록이 **각자 브라우저에만** 남습니다.

### 2-1. 테이블 + 보안 정책

Supabase 프로젝트 → SQL Editor에 붙여넣고 실행하세요.

```sql
create table public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null,
  alpha       double precision not null,   -- 동일가중 B&H 대비. 순위 기준
  alpha_idx   double precision,            -- 시장지수 대비. 참고용
  ret         double precision not null,
  mdd         double precision not null,
  stop_rate   double precision,
  trades      integer     not null default 0,
  seed        text,
  created_at  timestamptz not null default now()
);

alter table public.scores enable row level security;

-- 누구나 읽을 수 있다
create policy "read all" on public.scores
  for select to anon using (true);

-- 누구나 넣을 수 있지만, 말이 되는 값만 통과시킨다
create policy "insert sane" on public.scores
  for insert to anon with check (
    char_length(name) between 1 and 12
    and alpha between -1 and 100        -- 기준선 대비 -100% ~ +10,000%
    and ret   between -1 and 1000
    and mdd   between -1 and 0
    and trades between 0 and 100000
  );

-- 수정·삭제는 아무도 못 한다 (정책을 안 만들면 RLS가 전부 막는다)

create index scores_alpha_idx on public.scores (alpha desc);
```

### 2-2. 게임에 연결

`index.html`에서 `SB` 를 찾아 채웁니다.

```js
const SB = {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  key: 'eyJhbGciOi...',        // Project Settings → API → anon public
  table: 'scores',
};
```

`anon key`는 **클라이언트에 노출되는 게 정상**입니다. 실제 방어선은 위의 RLS입니다.
`service_role` 키는 절대 넣지 마세요.

### 2-3. 조작에 대해

브라우저에서 직접 POST를 날리면 아무 점수나 넣을 수 있습니다.
위 정책은 "말이 안 되는 값"만 막을 뿐, 작정한 조작은 막지 못합니다.

단톡방 친구들끼리 하는 재미 목적이면 이 정도가 적정선입니다.
더 막으려면 서버에서 리플레이를 재현·검증해야 하는데, 비용 대비 실익이 없습니다.

정 신경 쓰이면:
- `seed` 컬럼이 저장되므로, 의심스러운 기록은 같은 시드로 직접 돌려보면 검증됩니다
- 이름에 실명을 쓰게 하면 자정 작용이 생깁니다

---

## 3. 데이터 저작권

원본은 Yahoo Finance(미국·일본 상장)와 네이버 금융(KRX)에서 받았습니다.
게임에 실리는 데이터는 다음 네 단계를 거쳐 **원본 시계열이 아닙니다.**

1. 종목명을 가명(청룡·백호…)으로 치환
2. 시작가를 5만원으로 정규화 — 실제 주가 수준 제거
3. 매크로 오버레이 — 원래 시장 흐름을 벗기고 게임 시장을 입힘
4. 실제 날짜를 게임 연차로 치환

다만 `manifest.json`과 창 파일에는 **엔딩 공개용으로 실명과 실제 기간이 들어있습니다.**
브라우저 개발자 도구로 열면 보입니다. 스포일러가 신경 쓰이면 빌더에서 이 필드를
창 파일에만 남기고 `manifest.json`에서 빼면 됩니다.

상업적 이용은 각 소스의 이용약관을 확인하세요. 지인 대상 비상업 배포를 전제로 한 구성입니다.

---

## 4. 배포 전 점검

```bash
node tools/build-game-data.mjs      # 데이터 재생성
node tools/serve.mjs                # http://localhost:8123 에서 최종 확인
```

- [ ] 새 판이 정상적으로 뽑히는가
- [ ] 새로고침 후 `이어하기`가 뜨고 자산·보유가 그대로인가
- [ ] 30년 끝까지 돌려 엔딩 리포트가 뜨는가
- [ ] `종목 정체` 탭에 실명이 나오는가
- [ ] 리더보드 등록이 되는가
- [ ] `data/raw/`가 커밋되지 않았는가
