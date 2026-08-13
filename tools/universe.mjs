/**
 * 유니버스 정의 — 미국 + 한국 (일본은 아래 EXCLUDED_JP 참고)
 *
 * band = 30년 총수익 배수의 [하한, 상한]. 한 종목이 유니버스를 지배하는 것을 막는다.
 *        창을 어디서 자르느냐로 조절되며, 밴드를 만족하는 창이 없으면 빌드 시 경고가 뜬다.
 *
 * archetype — 매 판 유형 쿼터로 뽑아 라운드마다 다른 교훈이 나오게 한다
 *   폭발형   30년 안에 크게 터지는 주도주        (오닐/미너비니의 표적)
 *   우상향형 꾸준히 오르는 대형주                (버티기의 보상)
 *   붕괴형   정점 후 -80% 이상 무너짐            (손절의 이유)
 *   쇠퇴형   한때 최고였다가 서서히 죽음          (추세 이탈 판단)
 *   사이클형 크게 오르내림을 반복                (타이밍 훈련)
 *   방어형   저베타. 위기에 덜 빠지고 덜 오름     (β 개념 학습)
 */

export const YAHOO = 'yahoo';   // 미국 상장 (미국 종목 + 일본/한국 ADR). quote OHLC = 분할반영·배당미반영
export const NAVER = 'naver';   // KRX 직접. 수정주가(분할반영)·배당미반영

export const UNIVERSE = [
  /* ─────────────── 미국 22 ─────────────── */
  { id: 'CSCO', src: YAHOO, sym: 'CSCO', name: '시스코',            mkt: 'US', archetype: '붕괴형',   band: [15, 50] },
  { id: 'MSFT', src: YAHOO, sym: 'MSFT', name: '마이크로소프트',    mkt: 'US', archetype: '우상향형', band: [15, 120] },
  { id: 'ORCL', src: YAHOO, sym: 'ORCL', name: '오라클',            mkt: 'US', archetype: '폭발형',   band: [15, 120] },
  { id: 'QCOM', src: YAHOO, sym: 'QCOM', name: '퀄컴',              mkt: 'US', archetype: '폭발형',   band: [10, 120] },
  { id: 'AMAT', src: YAHOO, sym: 'AMAT', name: '어플라이드머티리얼즈', mkt: 'US', archetype: '사이클형', band: [10, 60] },
  { id: 'AAPL', src: YAHOO, sym: 'AAPL', name: '애플',              mkt: 'US', archetype: '폭발형',   band: [20, 150] },
  { id: 'AMD',  src: YAHOO, sym: 'AMD',  name: 'AMD',               mkt: 'US', archetype: '사이클형', band: [3, 30] },
  { id: 'MU',   src: YAHOO, sym: 'MU',   name: '마이크론',          mkt: 'US', archetype: '사이클형', band: [3, 30] },
  { id: 'ADBE', src: YAHOO, sym: 'ADBE', name: '어도비',            mkt: 'US', archetype: '우상향형', band: [15, 120] },
  { id: 'INTC', src: YAHOO, sym: 'INTC', name: '인텔',              mkt: 'US', archetype: '쇠퇴형',   band: [1, 60] },
  { id: 'MNST', src: YAHOO, sym: 'MNST', name: '몬스터베버리지',    mkt: 'US', archetype: '폭발형',   band: [20, 250] },
  { id: 'SBUX', src: YAHOO, sym: 'SBUX', name: '스타벅스',          mkt: 'US', archetype: '우상향형', band: [10, 150] },
  { id: 'BBY',  src: YAHOO, sym: 'BBY',  name: '베스트바이',        mkt: 'US', archetype: '사이클형', band: [3, 120] },
  { id: 'C',    src: YAHOO, sym: 'C',    name: '씨티그룹',          mkt: 'US', archetype: '붕괴형',   band: [0.2, 8] },
  { id: 'AIG',  src: YAHOO, sym: 'AIG',  name: 'AIG',               mkt: 'US', archetype: '붕괴형',   band: [0.1, 6] },
  { id: 'GE',   src: YAHOO, sym: 'GE',   name: 'GE',                mkt: 'US', archetype: '쇠퇴형',   band: [0.5, 12] },
  { id: 'XRX',  src: YAHOO, sym: 'XRX',  name: '제록스',            mkt: 'US', archetype: '쇠퇴형',   band: [0.05, 5] },
  { id: 'NOK',  src: YAHOO, sym: 'NOK',  name: '노키아',            mkt: 'US', archetype: '붕괴형',   band: [0.2, 10] },
  { id: 'HPQ',  src: YAHOO, sym: 'HPQ',  name: 'HP',                mkt: 'US', archetype: '쇠퇴형',   band: [1, 20] },
  { id: 'KO',   src: YAHOO, sym: 'KO',   name: '코카콜라',          mkt: 'US', archetype: '방어형',   band: [2, 15] },
  { id: 'JNJ',  src: YAHOO, sym: 'JNJ',  name: '존슨앤드존슨',      mkt: 'US', archetype: '방어형',   band: [2, 20] },
  { id: 'SO',   src: YAHOO, sym: 'SO',   name: '서던컴퍼니',        mkt: 'US', archetype: '방어형',   band: [1, 10] },
  { id: 'WMT',  src: YAHOO, sym: 'WMT',  name: '월마트',            mkt: 'US', archetype: '우상향형', band: [5, 40] },
  { id: 'MCD',  src: YAHOO, sym: 'MCD',  name: '맥도날드',          mkt: 'US', archetype: '우상향형', band: [5, 30] },
  { id: 'CAT',  src: YAHOO, sym: 'CAT',  name: '캐터필러',          mkt: 'US', archetype: '사이클형', band: [5, 40] },
  { id: 'XOM',  src: YAHOO, sym: 'XOM',  name: '엑슨모빌',          mkt: 'US', archetype: '사이클형', band: [2, 20] },
  { id: 'AA',   src: YAHOO, sym: 'AA',   name: '알코아',            mkt: 'US', archetype: '사이클형', band: [0.2, 10] },
  { id: 'NUE',  src: YAHOO, sym: 'NUE',  name: '뉴코',              mkt: 'US', archetype: '사이클형', band: [5, 40] },

  /* ─────────────── 한국 11 (네이버 · KRX 직접) ─────────────── */
  { id: 'KR005930', src: NAVER, sym: '005930', name: '삼성전자',      mkt: 'KR', archetype: '우상향형', band: [3, 120] },
  { id: 'KR005380', src: NAVER, sym: '005380', name: '현대차',        mkt: 'KR', archetype: '사이클형', band: [3, 25] },
  { id: 'KR005490', src: NAVER, sym: '005490', name: 'POSCO홀딩스',   mkt: 'KR', archetype: '사이클형', band: [2, 20] },
  { id: 'KR015760', src: NAVER, sym: '015760', name: '한국전력',      mkt: 'KR', archetype: '방어형',   band: [0.3, 5] },
  { id: 'KR017670', src: NAVER, sym: '017670', name: 'SK텔레콤',      mkt: 'KR', archetype: '붕괴형',   band: [5, 50] },
  { id: 'KR009150', src: NAVER, sym: '009150', name: '삼성전기',      mkt: 'KR', archetype: '사이클형', band: [3, 30] },
  { id: 'KR003550', src: NAVER, sym: '003550', name: 'LG',            mkt: 'KR', archetype: '우상향형', band: [1, 15] },
  { id: 'KR010140', src: NAVER, sym: '010140', name: '삼성중공업',    mkt: 'KR', archetype: '붕괴형',   band: [0.1, 8] },
  { id: 'KR012330', src: NAVER, sym: '012330', name: '현대모비스',    mkt: 'KR', archetype: '폭발형',   band: [5, 40] },
  { id: 'KR011200', src: NAVER, sym: '011200', name: 'HMM',           mkt: 'KR', archetype: '사이클형', band: [0.1, 10] },
  { id: 'KR000270', src: NAVER, sym: '000270', name: '기아',          mkt: 'KR', archetype: '사이클형', band: [0.3, 15] },

];

/**
 * 일본 — 게임에서 제외 (2026-08 결정)
 *
 * 30년 일봉을 주는 일본 소스가 미국 상장 ADR밖에 없는데, ADR은 도쿄 장 마감 후
 * 이미 정해진 가격을 따라 거래되고 거래량도 본토보다 훨씬 적다. 그래서
 *   · 일간 고저폭이 1.17%로 미국(2.32%)의 절반 — 캔들 느낌이 눈에 띄게 다르다
 *   · 1980~90년대 구간은 OHLC가 부실해 품질 게이트에서 고마츠·닛산이 이미 탈락
 * 남은 4종목도 "조용한 차트"라 위화감이 남아 통째로 뺐다.
 *
 * 되살리려면 아래를 UNIVERSE에 다시 넣고 index.html의 일본 쿼터를 복구하면 된다.
 * 원본 데이터(data/raw/*.json)는 지우지 않았다.
 */
export const EXCLUDED_JP = [
  { id: 'SONY',  src: YAHOO, sym: 'SONY',  name: '소니',           mkt: 'JP', archetype: '붕괴형',   band: [1, 15] },
  { id: 'TM',    src: YAHOO, sym: 'TM',    name: '도요타',         mkt: 'JP', archetype: '우상향형', band: [2, 20] },
  { id: 'HMC',   src: YAHOO, sym: 'HMC',   name: '혼다',           mkt: 'JP', archetype: '사이클형', band: [1, 15] },
  { id: 'HTHIY', src: YAHOO, sym: 'HTHIY', name: '히타치',         mkt: 'JP', archetype: '회생형',   band: [1, 15] },
  { id: 'MITSY', src: YAHOO, sym: 'MITSY', name: '미쓰비시상사',   mkt: 'JP', archetype: '사이클형', band: [1, 20] },
  { id: 'TKOMY', src: YAHOO, sym: 'TKOMY', name: '고마츠',         mkt: 'JP', archetype: '사이클형', band: [1, 20] },
  { id: 'NSANY', src: YAHOO, sym: 'NSANY', name: '닛산',           mkt: 'JP', archetype: '쇠퇴형',   band: [0.2, 8] },
];

/** 참조 지수 — 오버레이가 "벗겨낼" 원래 시장 */
export const INDICES = [
  { id: 'SPX',   src: YAHOO, sym: '^GSPC', name: 'S&P 500' },   // 미국 상장 전부 (일본 ADR 포함)
  { id: 'KOSPI', src: NAVER, sym: 'KOSPI', name: '코스피' },     // 네이버 KRX 종목
];
export const indexFor = (u) => (u.src === NAVER ? 'KOSPI' : 'SPX');
