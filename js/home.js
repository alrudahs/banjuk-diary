// 홈 대시보드 (S-01, F-01)와 약한 품목 분석 (S-07, F-14).
// 계산은 모두 stats.js가 하고, 이 파일은 보여 주기만 한다.

import { getAll, STORES } from './db.js';
import { refreshItems, getAllItems, findItem } from './items.js';
import { getSettings } from './settings.js';
import { recordAverage, formatScore, sortRecordsNewestFirst, weekCount, weakItems, itemStats, daysUntil, formatDday } from './stats.js';
import { escapeHtml as h, formatDate, formatShortDate, emptyStateHtml } from './utils.js';

async function loadData() {
  try {
    await refreshItems();
  } catch (err) {
    console.error(err);
  }
  let records = [];
  try {
    records = sortRecordsNewestFirst(await getAll(STORES.records));
  } catch (err) {
    console.warn('기록을 불러오지 못했어요:', err);
  }
  return { records, items: getAllItems() };
}

function thumbOf(item, record) {
  const src = record?.photos?.[0] || item?.thumbnail || 'images/items/default.svg';
  return `<img src="${h(src)}" alt="" loading="lazy">`;
}

/* ===== 홈 ===== */

function ddayHtml() {
  const { examDate } = getSettings();
  const days = daysUntil(examDate);
  if (days == null) {
    return '<a class="home-dday-empty" href="#settings">시험일을 넣으면 D-day를 보여 줘요 →</a>';
  }
  return `
    <div class="home-dday${days < 0 ? ' is-past' : ''}">
      <strong>${formatDday(days)}</strong>
      <span>${days < 0 ? '시험일이 지났어요' : `실기 시험 ${h(formatDate(examDate))}`}</span>
    </div>`;
}

function weakHtml(weak) {
  if (!weak.length) {
    return '<div class="card"><p class="card-text">같은 품목을 2번 이상 기록하면 점수가 낮은 품목을 골라 보여 줘요.</p></div>';
  }
  return `<div class="weak-list">${weak
    .map(
      ({ item, recentAverage, count }) => `
      <a class="card card-link weak-card" href="#items/${encodeURIComponent(item.id)}">
        <div class="weak-thumb">${thumbOf(item)}</div>
        <div class="weak-body">
          <p class="weak-name">${h(item.name)}</p>
          <p class="weak-meta">최근 3회 평균 <strong>${formatScore(recentAverage)}</strong> · 연습 ${count}회</p>
        </div>
      </a>`,
    )
    .join('')}</div>`;
}

function recentHtml(records) {
  if (!records.length) {
    return emptyStateHtml({ title: '아직 기록이 없어요', text: '품목을 골라 첫 연습을 시작해 보세요!' });
  }
  return `<div class="card recent-list">${records
    .map((record) => {
      const item = findItem(record.itemId);
      return `
      <a class="recent-row" href="#records/${encodeURIComponent(record.id)}">
        <span class="recent-thumb">${thumbOf(item, record)}</span>
        <span class="recent-body">
          <span class="recent-name">${h(item?.name || record.itemName)}</span>
          <span class="recent-date">${h(formatShortDate(record.date))}</span>
        </span>
        <span class="recent-score">★ ${formatScore(recordAverage(record))}</span>
      </a>`;
    })
    .join('')}</div>`;
}

export async function showHome(container) {
  const { records, items } = await loadData();
  const weak = weakItems(records, items);

  container.innerHTML = `
    <div class="home-col home-col-a">
      <section class="card home-hero">
        <p class="home-greeting">안녕하세요!</p>
        <h2 class="home-title">오늘도 반죽해 볼까요?</h2>
        ${ddayHtml()}
      </section>

      <div class="home-stats">
        <div class="card home-stat">
          <span class="home-stat-label">이번 주 연습</span>
          <strong class="home-stat-value">${weekCount(records)}<small>회</small></strong>
        </div>
        <div class="card home-stat">
          <span class="home-stat-label">전체 기록</span>
          <strong class="home-stat-value">${records.length}<small>회</small></strong>
        </div>
      </div>

      <a class="btn btn-primary btn-lg btn-block home-go" href="#items">연습하러 가기</a>
    </div>

    <div class="home-col home-col-b">
      <section class="home-section home-weak">
        <div class="section-head">
          <h3 class="section-title">약한 품목</h3>
          <a class="section-link" href="#analysis">분석 보기 →</a>
        </div>
        ${weakHtml(weak)}
      </section>

      <section class="home-section home-recent">
        <div class="section-head">
          <h3 class="section-title">최근 연습</h3>
          ${records.length ? '<a class="section-link" href="#records">전체 기록 →</a>' : ''}
        </div>
        ${recentHtml(records.slice(0, 3))}
      </section>
    </div>`;
}

/* ===== 분석 (F-14) ===== */

function trendHtml(trend) {
  if (trend.length < 2) return trend.length ? formatScore(trend[0]) : '-';
  const diff = trend[trend.length - 1] - trend[0];
  const arrow = diff > 0.05 ? '<span class="trend-up" aria-label="올랐어요">▲</span>' : diff < -0.05 ? '<span class="trend-down" aria-label="내렸어요">▼</span>' : '<span class="trend-flat" aria-label="비슷해요">–</span>';
  return `${trend.map(formatScore).join(' → ')} ${arrow}`;
}

export async function showAnalysis(container) {
  const { records, items } = await loadData();
  const weakIds = new Set(weakItems(records, items).map((w) => w.item.id));

  // 약한 품목 → 점수 낮은 순 → 기록 1회 → 아직 연습하지 않은 품목
  const rows = itemStats(records, items).sort((a, b) => {
    const rank = (s) => (weakIds.has(s.item.id) ? 0 : s.count >= 2 ? 1 : s.count === 1 ? 2 : 3);
    return rank(a) - rank(b) || (a.recentAverage ?? 9) - (b.recentAverage ?? 9) || a.count - b.count;
  });

  container.innerHTML = `
    <a class="btn btn-secondary back-btn" href="#home">← 홈</a>
    <h2 class="screen-title form-title">약한 품목 분석</h2>
    <p class="card-text analysis-intro">최근 3회 평균 점수가 낮은 품목부터 보여 줘요. 기록이 2회 이상인 품목 가운데 가장 낮은 2개를 <strong>약한 품목</strong>으로 골라요.</p>

    <div class="card analysis-card">
      <table class="analysis-table">
        <thead>
          <tr><th scope="col">품목</th><th scope="col">횟수</th><th scope="col">최근 3회</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (s) => `
            <tr class="${weakIds.has(s.item.id) ? 'is-weak' : ''}">
              <th scope="row">
                <a href="#items/${encodeURIComponent(s.item.id)}">${h(s.item.name)}</a>
                ${weakIds.has(s.item.id) ? '<span class="badge badge-danger">약한 품목</span>' : ''}
                <span class="analysis-trend">${s.count ? `추이 ${trendHtml(s.trend)}` : '아직 연습하지 않았어요'}</span>
              </th>
              <td>${s.count}회</td>
              <td class="analysis-score">${formatScore(s.recentAverage)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="field-hint">추이는 최근 5회 기록의 평균 점수예요 (왼쪽이 오래된 기록). 삭제한 내 품목의 기록은 빼고 계산해요.</p>`;
}
