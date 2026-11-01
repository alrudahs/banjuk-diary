// 기록 계산 (prd 7.3). 홈 대시보드와 분석 화면(9단계)도 이 파일의 계산을 같이 쓴다.

export const SCORE_KEYS = ['volume', 'shape', 'color', 'crumb'];

/** 기록 평균 점수 = 부피·모양·색·내상 점수의 평균 */
export function recordAverage(record) {
  const values = SCORE_KEYS.map((key) => Number(record.scores?.[key])).filter(Number.isFinite);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 3.25 → "3.3" */
export function formatScore(value) {
  return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '-';
}

/** 최신 기록이 앞에 오도록 정렬 (날짜 최신순, 같은 날짜면 작성 시각 최신순) */
export function sortRecordsNewestFirst(records) {
  return [...records].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

/** 품목별 기록 수 { itemId: 횟수 } */
export function practiceCounts(records) {
  return records.reduce((counts, r) => {
    counts[r.itemId] = (counts[r.itemId] || 0) + 1;
    return counts;
  }, {});
}

function startOfWeek(today) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일
  return d;
}

const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 이번 주 연습 횟수 = 날짜가 이번 주 월요일~일요일인 기록 수 */
export function weekCount(records, today = new Date()) {
  const monday = startOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = dateKey(monday);
  const to = dateKey(sunday);
  return records.filter((r) => r.date >= from && r.date <= to).length;
}

/**
 * 품목별 통계. 품목 목록(items)에 있는 품목만 계산한다 (삭제된 내 품목의 기록은 뺀다).
 * 결과: [{ item, count, recentAverage, overallAverage, trend }]
 *   recentAverage : 최근 3회 기록 평균 점수의 평균
 *   trend         : 최근 5회 평균 점수 (오래된 것 → 최근)
 */
export function itemStats(records, items) {
  return items.map((item) => {
    const mine = sortRecordsNewestFirst(records.filter((r) => r.itemId === item.id));
    const averages = mine.map(recordAverage).filter(Number.isFinite);
    const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
    return {
      item,
      count: mine.length,
      recentAverage: mean(averages.slice(0, 3)),
      overallAverage: mean(averages),
      trend: averages.slice(0, 5).reverse(),
    };
  });
}

/**
 * 약한 품목 = 기록이 2회 이상인 품목 가운데 최근 3회 평균이 낮은 순서로 limit개.
 * 평균이 같으면 연습 횟수가 적은 품목을 먼저.
 */
export function weakItems(records, items, limit = 2) {
  return itemStats(records, items)
    .filter((s) => s.count >= 2 && Number.isFinite(s.recentAverage))
    .sort((a, b) => a.recentAverage - b.recentAverage || a.count - b.count)
    .slice(0, limit);
}

/** 시험일까지 남은 날. 오늘이면 0, 지났으면 음수. 시험일이 없으면 null */
export function daysUntil(dateString, today = new Date()) {
  const [y, m, d] = String(dateString || '').split('-').map(Number);
  if (!y) return null;
  const exam = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exam - base) / 86400000);
}

/** 12 → "D-12", 0 → "D-day", -3 → "D+3" */
export function formatDday(days) {
  if (days == null) return '';
  if (days === 0) return 'D-day';
  return days > 0 ? `D-${days}` : `D+${-days}`;
}
