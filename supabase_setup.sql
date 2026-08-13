-- ============================================================
--  주식전설 — 리더보드 테이블
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run] 한 번이면 끝납니다.
--  (Pulse Grid / 김부장 게임과 같은 프로젝트에 테이블 하나만 추가됩니다.)
-- ============================================================

create table if not exists public.stock_legends_scores (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  alpha       double precision not null,  -- 전 종목 묻어두기 대비 (순위 기준)
  alpha_idx   double precision not null,  -- 지수 묻어두기 대비
  ret         double precision not null,  -- 30년 총 수익률
  mdd         double precision not null,  -- 최대 낙폭 (음수)
  stop_rate   double precision,           -- 손절 준수율 (매매가 없으면 null)
  trades      int not null,               -- 청산 횟수
  seed        text                        -- 판 시드 (같은 판 비교용)
);

-- 리더보드는 알파 내림차순으로만 읽으므로 인덱스를 걸어둔다
create index if not exists stock_legends_scores_alpha_idx
  on public.stock_legends_scores (alpha desc);

alter table public.stock_legends_scores enable row level security;

-- 익명 쓰기 허용. 값 범위를 검증해 말도 안 되는 기록을 막는다.
-- 클라이언트에서 보내는 값이라 완벽한 방어는 아니지만, 단톡방 규모에는 충분하다.
drop policy if exists "anon can insert scores" on public.stock_legends_scores;
create policy "anon can insert scores"
  on public.stock_legends_scores
  for insert
  to anon
  with check (
    char_length(name) between 1 and 12
    and alpha     between -1    and 10000    -- -100% ~ +1,000,000%
    and alpha_idx between -1    and 10000
    and ret       between -1    and 100000
    and mdd       between -1    and 0        -- 낙폭은 항상 0 이하
    and (stop_rate is null or stop_rate between 0 and 1)
    and trades    between 0     and 100000
  );

-- 익명 읽기 허용 (리더보드 표시용)
drop policy if exists "anon can read scores" on public.stock_legends_scores;
create policy "anon can read scores"
  on public.stock_legends_scores
  for select
  to anon
  using (true);

-- 수정·삭제는 아무에게도 열어주지 않는다 (정책이 없으면 RLS가 전부 막는다)
