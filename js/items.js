// 품목 목록과 상세, 내 품목 삭제. (F-02, F-03, F-17, F-18, F-20)
// 기본 품목(data/items.json)과 내 품목(IndexedDB items)을 합쳐서 보여 준다.
// 추가·수정·복사 화면은 item-editor.js가 그린다.

import { getAll, remove, STORES } from './db.js';
import { calcGroups, calculatorHtml, bindCalculator, ingredientValueLabel, resetCalcState, getCalcValues } from './calculator.js';
import { openEditor } from './item-editor.js';
import { getActiveSession, startPractice, discardPractice } from './timer.js';
import { getLastFailureNote } from './records.js';
import { escapeHtml as h, formatMinutes, formatNumber, formatDate, confirmDialog, emptyStateHtml } from './utils.js';

const FILTERS = {
  all: () => true,
  exam: (item) => item.type === '실기',
  mine: (item) => item.source === '내 품목',
};

const state = {
  category: '제빵',
  filter: 'all',
  query: '',
};

let baseItems = null; // items.json은 한 번만 불러온다
let allItems = [];
let practiceCounts = {};

const els = {};

async function loadBaseItems() {
  if (!baseItems) {
    const res = await fetch('data/items.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`items.json을 불러오지 못했어요 (${res.status})`);
    baseItems = await res.json();
  }
  return baseItems;
}

// 기기 저장소를 쓸 수 없어도 기본 품목은 보이도록, 실패하면 빈 목록으로 둔다
async function loadMyItems() {
  try {
    const mine = await getAll(STORES.items);
    return mine.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  } catch (err) {
    console.warn('내 품목을 불러오지 못했어요:', err);
    return [];
  }
}

async function loadPracticeCounts() {
  try {
    const records = await getAll(STORES.records);
    return records.reduce((counts, record) => {
      counts[record.itemId] = (counts[record.itemId] || 0) + 1;
      return counts;
    }, {});
  } catch (err) {
    console.warn('연습 기록을 불러오지 못했어요:', err);
    return {};
  }
}

/** 기본 품목과 내 품목을 다시 불러와 합친다 */
export async function refreshItems() {
  const [base, mine, counts] = await Promise.all([loadBaseItems(), loadMyItems(), loadPracticeCounts()]);
  allItems = [...base, ...mine];
  practiceCounts = counts;
  return allItems;
}

export function getAllItems() {
  return allItems;
}

export function findItem(id) {
  return allItems.find((item) => item.id === id);
}

/** "시험 2시간 40분" / "목표 1시간" / "" */
export function timeLabel(item) {
  if (!Number.isFinite(item.examMinutes)) return '';
  return `${item.type === '실기' ? '시험' : '목표'} ${formatMinutes(item.examMinutes)}`;
}

function badgesHtml(item, withCount) {
  const badges = [];
  if (item.type === '실기') badges.push('<span class="badge badge-exam">실기</span>');
  if (item.source === '내 품목') badges.push('<span class="badge badge-mine">내 품목</span>');
  if (withCount) badges.push(`<span class="badge badge-count">연습 ${practiceCounts[item.id] || 0}회</span>`);
  return `<div class="badges">${badges.join('')}</div>`;
}

const DEFAULT_IMAGE = 'images/items/default.svg';

// 사진이 없거나 못 불러오면 기본 이미지를 보여 준다
function thumbHtml(item, className) {
  return `<div class="${className}"><img src="${h(item.thumbnail || DEFAULT_IMAGE)}" alt="${h(item.name)} 사진" loading="lazy"></div>`;
}

function useDefaultImageOnError(container) {
  container.querySelectorAll('img').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        img.src = DEFAULT_IMAGE;
      },
      { once: true },
    );
  });
}

// 자유 라이선스 사진은 작가와 라이선스를 함께 보여 줘야 한다
function photoCreditHtml(item) {
  const c = item.photoCredit;
  if (!c) return '';
  return `
    <p class="photo-credit">
      사진: ${h(c.author)} ·
      <a href="${h(c.licenseUrl)}" target="_blank" rel="noopener">${h(c.license)}</a> ·
      <a href="${h(c.source)}" target="_blank" rel="noopener">원본</a>
    </p>`;
}

/* ===== 목록 ===== */

function visibleItems() {
  const query = state.query.trim().toLowerCase();
  return allItems
    .filter((item) => item.category === state.category)
    .filter(FILTERS[state.filter])
    .filter((item) => !query || item.name.toLowerCase().includes(query));
}

function emptyHtml() {
  if (state.query.trim()) {
    return emptyStateHtml({ title: `"${h(state.query.trim())}" 검색 결과가 없어요`, text: '이름을 다시 확인하거나 제과/제빵 탭을 바꿔 보세요.' });
  }
  if (state.filter === 'mine') {
    return emptyStateHtml({
      title: `아직 ${state.category} 내 품목이 없어요`,
      text: '실기 품목이 아닌 빵·과자도 내 레시피로 정리해 두고 똑같이 연습할 수 있어요.',
      action: '<a class="btn btn-primary btn-block" href="#items/new">+ 품목 추가</a>',
    });
  }
  return emptyStateHtml({ title: `${state.category} ${state.filter === 'exam' ? '실기 ' : ''}품목이 없어요` });
}

function renderList() {
  els.categoryButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.category === state.category));
  });
  els.filterButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === state.filter));
  });

  const items = visibleItems();
  if (items.length === 0) {
    els.list.innerHTML = emptyHtml();
    return;
  }

  els.list.innerHTML = items
    .map((item) => {
      const meta = [timeLabel(item), item.method].filter(Boolean).map(h).join(' · ');
      return `
        <a class="card card-link item-card" href="#items/${encodeURIComponent(item.id)}">
          ${thumbHtml(item, 'item-thumb')}
          <div class="item-card-body">
            ${badgesHtml(item, true)}
            <h3 class="item-card-name">${h(item.name)}</h3>
            ${meta ? `<p class="item-card-meta">${meta}</p>` : ''}
          </div>
        </a>`;
    })
    .join('');
  useDefaultImageOnError(els.list);
}

/* ===== 상세 ===== */

function listSection(title, values) {
  const list = (values || []).filter((v) => String(v).trim());
  if (list.length === 0) return '';
  return `
    <section class="card detail-section">
      <h3 class="card-title">${title}</h3>
      <ul class="bullet-list">${list.map((v) => `<li>${h(v)}</li>`).join('')}</ul>
    </section>`;
}

function groupBasisLabel(item, group) {
  if (group.basis === 'percent') return `밀가루 ${formatNumber(item.baseFlourGram)}g 기준`;
  if (group.basis === 'perPiece') return `${formatNumber(item.basePieces)}개 기준`;
  return '고정량';
}

function recipeHtml(item) {
  const { groups, total } = calcGroups(item);
  const tables = groups
    .map(
      (group) => `
      <table class="recipe-table">
        <caption><strong>${h(group.name)}</strong> <span>${groupBasisLabel(item, group)}</span></caption>
        <tbody>
          ${group.rows
            .map(
              (row) => `
            <tr>
              <th scope="row">${h(row.name)}</th>
              <td class="recipe-ratio">${h(ingredientValueLabel(group.basis, row.ingredient))}</td>
              <td class="recipe-gram">${formatNumber(row.gram)}g</td>
            </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr><th scope="row">소계</th><td></td><td class="recipe-gram">${formatNumber(group.subtotal)}g</td></tr>
        </tfoot>
      </table>`,
    )
    .join('');

  const totalRow = groups.length > 1 ? `<p class="recipe-total">전체 합계 <strong>${formatNumber(total)}g</strong></p>` : '';
  return `${tables}${totalRow}`;
}

function stepsHtml(steps) {
  return `
    <ol class="step-list">
      ${(steps || [])
        .map(
          (step) => `
        <li class="step">
          <div class="step-head">
            <span class="step-name">${h(step.name)}</span>
            <span class="step-time">${Number.isFinite(step.minutes) ? formatMinutes(step.minutes) : '끝나면 완료'}</span>
          </div>
          ${step.desc ? `<p class="step-desc">${h(step.desc)}</p>` : ''}
          ${step.tip ? `<p class="step-note step-tip"><strong>포인트</strong> ${h(step.tip)}</p>` : ''}
          ${step.parallel ? `<p class="step-note step-parallel"><strong>동시 진행</strong> ${h(step.parallel)}</p>` : ''}
        </li>`,
        )
        .join('')}
    </ol>`;
}

// 성형 영상 (F-06). 기본 컨트롤 대신 큰 버튼을 쓰고, playsinline으로 휴대폰에서도 화면 안에서 재생한다
function videoHtml(item) {
  if (!item.video) return '';
  return `
    <section class="card detail-section shaping-video">
      <h3 class="card-title">성형 영상</h3>
      <div class="video-frame">
        <video src="${h(item.video)}" playsinline preload="metadata" disablepictureinpicture></video>
      </div>
      <p class="video-error" hidden>영상을 불러오지 못했어요.</p>
      <div class="btn-group video-controls">
        <button type="button" class="btn btn-primary" data-video="play">▶ 재생</button>
        <button type="button" class="btn btn-secondary" data-video="slow" aria-pressed="false">0.5배속</button>
      </div>
    </section>`;
}

function bindVideo(container) {
  const section = container.querySelector('.shaping-video');
  if (!section) return;
  const video = section.querySelector('video');
  const playBtn = section.querySelector('[data-video="play"]');
  const slowBtn = section.querySelector('[data-video="slow"]');

  const sync = () => {
    playBtn.textContent = video.paused ? '▶ 재생' : '❚❚ 정지';
    const slow = video.playbackRate === 0.5;
    slowBtn.setAttribute('aria-pressed', String(slow));
    slowBtn.textContent = slow ? '0.5배속 켜짐' : '0.5배속';
  };
  const togglePlay = () => {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  playBtn.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  slowBtn.addEventListener('click', () => {
    const rate = video.playbackRate === 0.5 ? 1 : 0.5;
    video.defaultPlaybackRate = rate; // 처음부터 다시 재생해도 유지되게
    video.playbackRate = rate;
  });
  ['play', 'pause', 'ended', 'ratechange'].forEach((type) => video.addEventListener(type, sync));
  video.addEventListener('error', () => {
    section.querySelector('.video-frame').hidden = true;
    section.querySelector('.video-controls').hidden = true;
    section.querySelector('.video-error').hidden = false;
  });
}

function renderDetail(item) {
  const facts = [
    [item.type === '실기' ? '시험 시간' : '목표 시간', Number.isFinite(item.examMinutes) ? formatMinutes(item.examMinutes) : ''],
    ['분류', item.category],
    ['반죽법', item.method],
  ].filter(([, value]) => value);

  els.detail.innerHTML = `
    <a class="btn btn-secondary back-btn" href="#items">← 목록으로</a>

    <div class="detail-layout">
      <div class="detail-main">
      ${thumbHtml(item, 'detail-hero')}
      ${photoCreditHtml(item)}

      <div class="detail-head">
        ${badgesHtml(item, true)}
        <h2 class="detail-name">${h(item.name)}</h2>
        <dl class="detail-facts">
          ${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${h(value)}</dd></div>`).join('')}
        </dl>
      </div>

      ${
        item.source === '내 품목'
          ? `<div class="btn-group detail-actions">
              <a class="btn btn-secondary" href="#items/edit/${encodeURIComponent(item.id)}">수정</a>
              <button type="button" class="btn btn-danger" data-action="delete-item">삭제</button>
            </div>`
          : `<a class="btn btn-outline btn-block detail-actions" href="#items/copy/${encodeURIComponent(item.id)}">복사해서 내 품목으로 만들기</a>`
      }

      ${item.type === '실기' ? listSection('요구 사항', item.requirements) : ''}
      ${listSection('주의할 점', item.notes)}
      ${listSection('완성 기준', item.criteria)}

      ${item.memo ? `<section class="card detail-section"><h3 class="card-title">메모</h3><p class="detail-memo">${h(item.memo)}</p></section>` : ''}
      </div>

      <div class="detail-side">
      <div data-last-note></div>

      <section class="card detail-section">
        <h3 class="card-title">기본 레시피</h3>
        <h4 class="detail-subtitle">기준 배합</h4>
        ${recipeHtml(item)}
        <h4 class="detail-subtitle">만드는 순서</h4>
        ${stepsHtml(item.steps)}
      </section>

      ${calculatorHtml(item)}

      ${videoHtml(item)}

      <div class="start-area">
        <button type="button" class="btn btn-primary btn-block btn-lg start-btn">연습 시작</button>
      </div>
      </div>
    </div>
  `;
  useDefaultImageOnError(els.detail);
  bindVideo(els.detail);

  // 계량을 모두 체크하면 "연습 시작" 버튼을 강조한다 (F-05)
  const startBtn = els.detail.querySelector('.start-btn');
  const resuming = getActiveSession()?.item.id === item.id;
  bindCalculator(els.detail, item, (allChecked) => {
    startBtn.classList.toggle('btn-highlight', allChecked && !resuming);
    startBtn.textContent = resuming ? '진행 중인 연습으로 돌아가기' : allChecked ? '계량 완료 · 연습 시작' : '연습 시작';
  });
  startBtn.addEventListener('click', () => startPracticeFor(item));

  showLastNote(item);

  const deleteBtn = els.detail.querySelector('[data-action="delete-item"]');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteMyItem(item));
}

// 지난 연습의 실패 노트를 연습 전에 먼저 보여 준다 (F-13)
async function showLastNote(item) {
  const note = await getLastFailureNote(item.id);
  const slot = els.detail.querySelector('[data-last-note]');
  if (!note || !slot) return;
  slot.innerHTML = `
    <section class="card detail-section last-note">
      <h3 class="card-title">지난 연습 실패 노트</h3>
      <p class="practice-label">${h(formatDate(note.date))}</p>
      ${note.troubles.length ? `<ul class="last-note-list">${note.troubles.map((t) => `<li><strong>${h(t.symptom)}</strong>${t.fixes.length ? ` → ${h(t.fixes.join(', '))}` : ''}</li>`).join('')}</ul>` : ''}
      ${note.bad ? `<p class="last-note-bad"><strong>아쉬운 점</strong> ${h(note.bad)}</p>` : ''}
    </section>`;
}

// 연습 시작. 다른 품목을 연습하는 중이면 먼저 물어본다 (연습은 한 번에 하나만)
async function startPracticeFor(item) {
  const active = getActiveSession();
  if (active && active.item.id !== item.id) {
    const ok = await confirmDialog({
      title: '진행 중인 연습이 있어요',
      message: `"${active.item.name}" 연습이 아직 끝나지 않았어요. 새로 시작하면 그 연습은 기록 없이 사라져요.`,
      confirmLabel: '새로 시작',
      danger: true,
    });
    if (!ok) return;
    discardPractice();
  }
  if (!getActiveSession()) {
    const lastNote = await getLastFailureNote(item.id);
    startPractice(item, { ...getCalcValues(item), lastNote });
  }
  location.hash = '#practice';
}

// 내 품목 삭제 (F-20). 연습 기록은 지우지 않는다 (기록에 품목 이름이 함께 저장되어 있다)
async function deleteMyItem(item) {
  const ok = await confirmDialog({
    title: `"${item.name}" 품목을 삭제할까요?`,
    message: '삭제한 품목은 되돌릴 수 없어요. 이 품목의 연습 기록은 그대로 남아요.',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  try {
    await remove(STORES.items, item.id);
  } catch (err) {
    console.error(err);
    await confirmDialog({ title: '삭제하지 못했어요', message: '잠시 뒤 다시 시도해 주세요.', confirmLabel: '확인' });
    return;
  }
  resetCalcState(item.id);
  location.replace('#items');
}

/* ===== 화면 전환 ===== */

function showView(name) {
  els.listView.hidden = name !== 'list';
  els.detail.hidden = name !== 'detail';
  els.editor.hidden = name !== 'editor';
}

/**
 * 품목 탭을 보여 준다. 주소(#items/...)에 따라:
 *   []                → 목록
 *   ['new']           → 품목 추가
 *   ['edit', id]      → 내 품목 수정
 *   ['copy', id]      → 기본 품목 복사
 *   [id]              → 상세
 */
export async function showItems(params = []) {
  try {
    await refreshItems();
  } catch (err) {
    console.error(err);
    showView('list');
    els.list.innerHTML = '<div class="card"><p class="card-text">품목을 불러오지 못했어요. 로컬 서버로 열었는지 확인해 주세요.</p></div>';
    return;
  }

  const [first, second] = params;

  if (first === 'new') {
    showView('editor');
    openEditor(els.editor, 'new', null, { category: state.category });
    return;
  }

  if (first === 'edit' || first === 'copy') {
    const item = findItem(second);
    const allowed = item && (first === 'edit' ? item.source === '내 품목' : item.source === '기본');
    if (!allowed) {
      location.replace(item ? `#items/${encodeURIComponent(item.id)}` : '#items');
      return;
    }
    showView('editor');
    openEditor(els.editor, first, item);
    return;
  }

  const item = first ? findItem(first) : null;
  if (first && !item) {
    location.replace('#items'); // 없는 품목 주소면 목록으로
    return;
  }

  showView(item ? 'detail' : 'list');
  if (item) {
    renderDetail(item);
  } else {
    renderList();
  }
}

export function initItems() {
  els.listView = document.getElementById('items-list-view');
  els.detail = document.getElementById('items-detail-view');
  els.editor = document.getElementById('items-editor-view');
  els.list = document.getElementById('items-list');
  els.search = document.getElementById('items-search');
  els.categoryButtons = [...document.querySelectorAll('[data-category]')];
  els.filterButtons = [...document.querySelectorAll('[data-filter]')];

  els.categoryButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.category;
      renderList();
    });
  });
  els.filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      renderList();
    });
  });
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    renderList();
  });
}
