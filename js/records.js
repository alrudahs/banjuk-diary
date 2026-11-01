// 연습 기록 (S-05, S-06, F-10~F-13, F-22).
//   #records                 → 기록 갤러리
//   #records/new/practice    → 연습을 끝내고 기록 작성 (걸린 시간·밀가루 무게·개수 자동 입력)
//   #records/new             → 기록 직접 추가 (품목·날짜·걸린 시간을 직접 입력)
//   #records/<id>            → 기록 상세
//   #records/edit/<id>       → 기록 수정
// 기록은 IndexedDB records에 prd 7.2 구조로 저장한다.

import { getAll, getById, save, remove, STORES } from './db.js';
import { refreshItems, findItem, getAllItems } from './items.js';
import { getPracticeResult, clearPracticeResult } from './timer.js';
import { resizeImage, ACCEPT_TYPES } from './image.js';
import { recordAverage, formatScore, sortRecordsNewestFirst } from './stats.js';
import { escapeHtml as h, formatMinutes, formatDate, formatShortDate, toDateString, confirmDialog, emptyStateHtml } from './utils.js';

const SCORE_ITEMS = [
  ['volume', '부피'],
  ['shape', '모양'],
  ['color', '색'],
  ['crumb', '내상'],
];
const MAX_PHOTOS = 3;
const LIMITS = { memo: 500, minutes: 600 };

const els = {};
let galleryFilter = 'all';
let troublesCache = null;

// 작성 중인 기록
let form = null; // { mode: 'practice' | 'manual' | 'edit', draft, errors: Map }

/* ===== 데이터 ===== */

export async function loadTroubles() {
  if (!troublesCache) {
    try {
      const res = await fetch('data/troubles.json', { cache: 'no-cache' });
      troublesCache = res.ok ? await res.json() : [];
    } catch {
      troublesCache = [];
    }
  }
  return troublesCache;
}

async function loadRecords() {
  try {
    return sortRecordsNewestFirst(await getAll(STORES.records));
  } catch (err) {
    console.warn('기록을 불러오지 못했어요:', err);
    return [];
  }
}

/** 기록의 품목 이름. 품목이 삭제됐으면 기록에 저장해 둔 이름을 쓴다 */
function itemNameOf(record) {
  return findItem(record.itemId)?.name || record.itemName || '이름 없는 품목';
}

/**
 * 같은 품목의 가장 최근 실패 노트 (F-13). 실패 증상이나 아쉬운 점이 적힌 기록 중 가장 최근 것.
 * 없으면 null. 연습 시작 화면과 품목 상세에서 쓴다.
 */
export async function getLastFailureNote(itemId) {
  const records = (await loadRecords()).filter((r) => r.itemId === itemId);
  const record = records.find((r) => (r.troubles && r.troubles.length) || String(r.bad || '').trim());
  if (!record) return null;
  const troubles = await loadTroubles();
  return {
    date: record.date,
    bad: String(record.bad || '').trim(),
    troubles: (record.troubles || [])
      .map((id) => troubles.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => ({ symptom: t.symptom, fixes: t.fixes })),
  };
}

/* ===== 기록 작성·수정 화면 ===== */

function newDraft({ itemId = '', itemName = '', entry, elapsedMinutes = '', flourGram = null, pieces = null, date = toDateString() }) {
  return {
    id: null,
    itemId,
    itemName,
    entry,
    date,
    elapsedMinutes: elapsedMinutes === '' ? '' : String(elapsedMinutes),
    flourGram,
    pieces,
    photos: [],
    scores: { volume: 0, shape: 0, color: 0, crumb: 0 },
    good: '',
    bad: '',
    troubles: [],
    createdAt: null,
  };
}

function draftFromRecord(record) {
  return {
    ...record,
    elapsedMinutes: record.elapsedMinutes == null ? '' : String(record.elapsedMinutes),
    photos: [...(record.photos || [])],
    scores: { volume: 0, shape: 0, color: 0, crumb: 0, ...record.scores },
    troubles: [...(record.troubles || [])],
    good: record.good || '',
    bad: record.bad || '',
  };
}

function validate(draft) {
  const errors = new Map();
  if (!draft.itemId) errors.set('itemId', '품목을 골라 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.set('date', '날짜를 골라 주세요.');
  else if (draft.date > toDateString()) errors.set('date', '오늘 이후 날짜는 고를 수 없어요.');
  if (!/^\d+$/.test(String(draft.elapsedMinutes).trim()) || Number(draft.elapsedMinutes) < 1 || Number(draft.elapsedMinutes) > LIMITS.minutes) {
    errors.set('elapsedMinutes', `걸린 시간은 1~${LIMITS.minutes}분 사이의 정수로 입력해 주세요.`);
  }
  const missing = SCORE_ITEMS.filter(([key]) => !(draft.scores[key] >= 1 && draft.scores[key] <= 5)).map(([, label]) => label);
  if (missing.length) errors.set('scores', `점수를 모두 매겨 주세요 (${missing.join(', ')}).`);
  if (draft.good.length > LIMITS.memo) errors.set('good', `잘된 점은 ${LIMITS.memo}자 이내로 써 주세요.`);
  if (draft.bad.length > LIMITS.memo) errors.set('bad', `아쉬운 점은 ${LIMITS.memo}자 이내로 써 주세요.`);
  if (draft.photos.length > MAX_PHOTOS) errors.set('photos', `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
  return errors;
}

function toRecord(draft) {
  const now = new Date().toISOString();
  const item = findItem(draft.itemId);
  return {
    id: draft.id || `rec-${draft.date.replaceAll('-', '')}-${Date.now().toString(36)}`,
    itemId: draft.itemId,
    itemName: item?.name || draft.itemName,
    entry: draft.entry,
    date: draft.date,
    flourGram: draft.flourGram ?? null,
    pieces: draft.pieces ?? null,
    elapsedMinutes: Number(draft.elapsedMinutes),
    photos: draft.photos,
    scores: { ...draft.scores },
    good: draft.good.trim(),
    bad: draft.bad.trim(),
    troubles: draft.troubles,
    createdAt: draft.createdAt || now,
    ...(draft.createdAt ? { updatedAt: now } : {}),
  };
}

const errClass = (key) => (form.errors.has(key) ? ' is-error' : '');
const errText = (key) => (form.errors.has(key) ? `<p class="field-error">${h(form.errors.get(key))}</p>` : '');

function itemFieldHtml(draft) {
  if (form.mode !== 'manual') {
    return `
      <div class="field">
        <span class="field-label">품목</span>
        <p class="record-item-fixed">${h(findItem(draft.itemId)?.name || draft.itemName)}</p>
      </div>`;
  }
  const items = getAllItems();
  const options = ['제빵', '제과']
    .map((category) => {
      const list = items.filter((item) => item.category === category);
      if (!list.length) return '';
      return `<optgroup label="${category}">${list
        .map((item) => `<option value="${h(item.id)}"${item.id === draft.itemId ? ' selected' : ''}>${h(item.name)}${item.source === '내 품목' ? ' (내 품목)' : ''}</option>`)
        .join('')}</optgroup>`;
    })
    .join('');
  return `
    <label class="field">
      <span class="field-label">품목</span>
      <select class="select${errClass('itemId')}" data-bind="itemId">
        <option value="">품목을 골라 주세요</option>
        ${options}
      </select>
      ${errText('itemId')}
    </label>`;
}

function photosHtml(draft) {
  return `
    <section class="card form-section">
      <h3 class="card-title">결과 사진 <span class="title-sub">${draft.photos.length}/${MAX_PHOTOS}</span></h3>
      ${
        draft.photos.length
          ? `<ul class="photo-thumbs">${draft.photos
              .map(
                (src, i) => `
              <li>
                <img src="${h(src)}" alt="결과 사진 ${i + 1}">
                <button type="button" class="photo-remove" data-action="remove-photo" data-index="${i}" aria-label="${i + 1}번째 사진 빼기">✕</button>
              </li>`,
              )
              .join('')}</ul>`
          : ''
      }
      ${
        draft.photos.length < MAX_PHOTOS
          ? `<label class="btn btn-outline btn-block">+ 사진 올리기<input type="file" accept="${ACCEPT_TYPES.join(',')}" multiple data-photos hidden></label>`
          : ''
      }
      <p class="field-hint photo-status">겉면 1장, 자른 단면 1장을 찍어 두면 회차별로 비교하기 좋아요.</p>
      ${errText('photos')}
    </section>`;
}

function scoresHtml(draft) {
  return `
    <section class="card form-section${form.errors.has('scores') ? ' has-error' : ''}">
      <h3 class="card-title">자기 점수</h3>
      ${SCORE_ITEMS.map(([key, label]) => {
        const value = draft.scores[key];
        return `
        <div class="score-row">
          <span class="score-label">${label}</span>
          <div class="stars" role="radiogroup" aria-label="${label} 점수">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<button type="button" class="star${n <= value ? ' is-on' : ''}" role="radio" aria-checked="${n === value}" aria-label="${label} ${n}점" data-action="score" data-key="${key}" data-value="${n}">★</button>`,
              )
              .join('')}
          </div>
          <span class="score-value">${value ? `${value}점` : '-'}</span>
        </div>`;
      }).join('')}
      ${errText('scores')}
    </section>`;
}

function troublesHtml(draft, troubles) {
  const categories = [...new Set(troubles.map((t) => t.category))];
  const selected = draft.troubles.map((id) => troubles.find((t) => t.id === id)).filter(Boolean);
  return `
    <section class="card form-section">
      <h3 class="card-title">실패 노트 <span class="title-sub">선택</span></h3>
      <p class="field-hint">아쉬웠던 증상을 고르면 원인 후보와 해결 방법을 보여 줘요. 다음에 이 품목을 연습할 때 먼저 띄워 줘요.</p>
      ${categories
        .map(
          (category) => `
        <div class="trouble-group">
          <p class="trouble-category">${h(category)}</p>
          <div class="chips">
            ${troubles
              .filter((t) => t.category === category)
              .map(
                (t) =>
                  `<button type="button" class="chip" data-action="trouble" data-id="${h(t.id)}" aria-pressed="${draft.troubles.includes(t.id)}">${h(t.symptom)}</button>`,
              )
              .join('')}
          </div>
        </div>`,
        )
        .join('')}
      ${selected.map(troubleDetailHtml).join('')}
    </section>`;
}

function troubleDetailHtml(trouble) {
  return `
    <div class="trouble-detail">
      <p class="trouble-symptom">${h(trouble.symptom)}</p>
      <ul class="trouble-pairs">
        ${trouble.causes
          .map(
            (cause, i) => `
          <li>
            <span class="trouble-cause">${h(cause)}</span>
            ${trouble.fixes[i] ? `<span class="trouble-fix">→ ${h(trouble.fixes[i])}</span>` : ''}
          </li>`,
          )
          .join('')}
      </ul>
    </div>`;
}

function cancelHref() {
  if (form.mode === 'edit') return `#records/${encodeURIComponent(form.draft.id)}`;
  return '#records';
}

async function renderForm() {
  const { draft, mode } = form;
  const troubles = await loadTroubles();
  const title = mode === 'edit' ? '기록 수정' : mode === 'manual' ? '기록 직접 추가' : '연습 기록 작성';

  els.form.innerHTML = `
    ${mode === 'practice' ? '' : `<a class="btn btn-secondary back-btn" href="${cancelHref()}">← 취소</a>`}
    <h2 class="screen-title form-title">${title}</h2>
    ${mode === 'practice' ? '<p class="editor-note">수고했어요! 걸린 시간은 연습 모드에서 자동으로 채웠어요.</p>' : ''}
    ${
      form.errors.size
        ? `<div class="card editor-errors" role="alert">
            <strong>고쳐야 할 곳이 ${form.errors.size}개 있어요</strong>
            <ul>${[...form.errors.values()].map((m) => `<li>${h(m)}</li>`).join('')}</ul>
          </div>`
        : ''
    }

    <section class="card form-section">
      ${itemFieldHtml(draft)}
      <div class="calc-inputs form-row">
        <label class="field">
          <span class="field-label">날짜</span>
          <input class="input${errClass('date')}" type="date" data-bind="date" value="${h(draft.date)}" max="${toDateString()}">
          ${errText('date')}
        </label>
        <label class="field">
          <span class="field-label">걸린 시간 (분)</span>
          <input class="input${errClass('elapsedMinutes')}" inputmode="numeric" data-bind="elapsedMinutes" value="${h(draft.elapsedMinutes)}" placeholder="예: 170">
          ${errText('elapsedMinutes')}
        </label>
      </div>
      ${
        draft.flourGram || draft.pieces
          ? `<p class="field-hint">계산기 값: ${[draft.flourGram && `밀가루 ${draft.flourGram}g`, draft.pieces && `${draft.pieces}개`].filter(Boolean).join(' · ')}</p>`
          : ''
      }
    </section>

    ${photosHtml(draft)}
    ${scoresHtml(draft)}

    <section class="card form-section">
      <label class="field">
        <span class="field-label">잘된 점</span>
        <textarea class="textarea${errClass('good')}" data-bind="good" maxlength="${LIMITS.memo}" placeholder="예: 성형이 고르게 됐어요">${h(draft.good)}</textarea>
        ${errText('good')}
      </label>
      <label class="field">
        <span class="field-label">아쉬운 점</span>
        <textarea class="textarea${errClass('bad')}" data-bind="bad" maxlength="${LIMITS.memo}" placeholder="예: 2차 발효가 조금 부족했어요">${h(draft.bad)}</textarea>
        ${errText('bad')}
      </label>
    </section>

    ${troublesHtml(draft, troubles)}

    <div class="btn-group editor-actions">
      ${
        mode === 'practice'
          ? '<button type="button" class="btn btn-secondary" data-action="skip">기록 안 하기</button>'
          : `<a class="btn btn-secondary" href="${cancelHref()}">취소</a>`
      }
      <button type="button" class="btn btn-primary btn-lg" data-action="save">저장</button>
    </div>`;
}

async function handleSave(button) {
  form.errors = validate(form.draft);
  if (form.errors.size) {
    await renderForm();
    els.form.querySelector('.editor-errors').scrollIntoView({ block: 'start' });
    return;
  }
  const record = toRecord(form.draft);
  button.disabled = true;
  try {
    await save(STORES.records, record);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    form.errors = new Map([['save', '저장하지 못했어요. 사진이 너무 많거나 기기 저장 공간이 부족할 수 있어요.']]);
    await renderForm();
    return;
  }
  if (form.mode === 'practice') clearPracticeResult();
  location.replace(`#records/${encodeURIComponent(record.id)}`);
}

async function handlePhotos(input) {
  const files = [...(input.files || [])];
  const status = els.form.querySelector('.photo-status');
  const room = MAX_PHOTOS - form.draft.photos.length; // 3장을 넘게 고르면 앞에서부터 남은 자리만큼만 올린다
  status.textContent = '사진을 줄이는 중이에요…';
  try {
    for (const file of files.slice(0, room)) {
      form.draft.photos.push(await resizeImage(file));
    }
    await renderForm();
  } catch (err) {
    status.textContent = err.message;
    status.classList.add('field-error');
  }
}

async function handleFormClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || !form) return;
  const { action } = button.dataset;
  const { draft } = form;

  if (action === 'save') return handleSave(button);
  if (action === 'skip') {
    const ok = await confirmDialog({
      title: '기록하지 않고 나갈까요?',
      message: '이번 연습의 걸린 시간은 저장되지 않아요.',
      confirmLabel: '나가기',
      danger: true,
    });
    if (!ok) return;
    clearPracticeResult();
    location.replace(draft.itemId ? `#items/${encodeURIComponent(draft.itemId)}` : '#records');
    return;
  }
  if (action === 'score') {
    draft.scores[button.dataset.key] = Number(button.dataset.value);
    form.errors.delete('scores');
  }
  if (action === 'remove-photo') draft.photos.splice(Number(button.dataset.index), 1);
  if (action === 'trouble') {
    const { id } = button.dataset;
    draft.troubles = draft.troubles.includes(id) ? draft.troubles.filter((t) => t !== id) : [...draft.troubles, id];
  }
  // 점수·사진·증상을 바꿔도 보던 위치가 유지되도록 스크롤을 기억해 둔다
  const y = window.scrollY;
  await renderForm();
  window.scrollTo(0, y);
}

function handleFormInput(event) {
  const { bind } = event.target.dataset;
  if (!bind || !form) return;
  form.draft[bind] = event.target.value;
}

/* ===== 갤러리 (F-11) ===== */

function tileHtml(record, showName) {
  const avg = recordAverage(record);
  const photo = record.photos?.[0];
  return `
    <a class="gallery-tile" href="#records/${encodeURIComponent(record.id)}">
      ${
        photo
          ? `<img src="${h(photo)}" alt="${h(itemNameOf(record))} ${h(formatShortDate(record.date))} 결과 사진" loading="lazy">`
          : `<span class="tile-placeholder">${h(itemNameOf(record).charAt(0))}</span>`
      }
      <span class="tile-info">
        ${showName ? `<span class="tile-name">${h(itemNameOf(record))}</span>` : ''}
        <span class="tile-meta"><span>${h(formatShortDate(record.date))}</span><span>★ ${formatScore(avg)}</span></span>
      </span>
    </a>`;
}

async function renderGallery() {
  const records = await loadRecords();

  // 기록이 있는 품목만 필터에 보여 준다
  const itemIds = [...new Set(records.map((r) => r.itemId))];
  if (galleryFilter !== 'all' && !itemIds.includes(galleryFilter)) galleryFilter = 'all';
  const visible = galleryFilter === 'all' ? records : records.filter((r) => r.itemId === galleryFilter);

  els.gallery.innerHTML = `
    <div class="screen-head">
      <h2 class="screen-title">기록</h2>
      <a class="btn btn-outline btn-small" href="#records/new">+ 기록 직접 추가</a>
    </div>
    ${
      records.length
        ? `
      <label class="field gallery-filter">
        <span class="visually-hidden">품목으로 거르기</span>
        <select class="select" data-gallery-filter>
          <option value="all">전체 품목 (${records.length})</option>
          ${itemIds
            .map((id) => {
              const count = records.filter((r) => r.itemId === id).length;
              const name = itemNameOf(records.find((r) => r.itemId === id));
              return `<option value="${h(id)}"${id === galleryFilter ? ' selected' : ''}>${h(name)} (${count})</option>`;
            })
            .join('')}
        </select>
      </label>
      <div class="gallery">${visible.map((r) => tileHtml(r, galleryFilter === 'all')).join('')}</div>`
        : emptyStateHtml({
            title: '아직 기록이 없어요',
            text: "품목에서 연습을 마치면 이곳에 결과 사진이 모여요. 학원에서 한 연습은 '기록 직접 추가'로 남겨요.",
            action: '<a class="btn btn-primary btn-block" href="#items">연습하러 가기</a>',
          })
    }`;
}

/* ===== 기록 상세 (F-11, F-12) ===== */

async function renderDetail(record) {
  const troubles = await loadTroubles();
  const avg = recordAverage(record);
  const item = findItem(record.itemId);
  const selected = (record.troubles || []).map((id) => troubles.find((t) => t.id === id)).filter(Boolean);
  const facts = [
    ['걸린 시간', formatMinutes(record.elapsedMinutes)],
    ['밀가루', record.flourGram ? `${record.flourGram}g` : ''],
    ['개수', record.pieces ? `${record.pieces}개` : ''],
    ['기록 방법', record.entry === 'manual' ? '직접 추가' : '연습 모드'],
  ].filter(([, v]) => v);

  els.detail.innerHTML = `
    <a class="btn btn-secondary back-btn" href="#records">← 기록 목록</a>

    ${
      record.photos?.length
        ? `<div class="record-photos count-${record.photos.length}">${record.photos
            .map((src, i) => `<img src="${h(src)}" alt="결과 사진 ${i + 1}">`)
            .join('')}</div>`
        : ''
    }

    <div class="detail-head">
      <p class="practice-label">${h(formatDate(record.date))}</p>
      <h2 class="detail-name">${
        item ? `<a class="record-item-link" href="#items/${encodeURIComponent(item.id)}">${h(item.name)}</a>` : `${h(itemNameOf(record))} <span class="title-sub">(삭제된 품목)</span>`
      }</h2>
      <dl class="detail-facts">
        ${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${h(value)}</dd></div>`).join('')}
      </dl>
    </div>

    <div class="btn-group detail-actions">
      <a class="btn btn-secondary" href="#records/edit/${encodeURIComponent(record.id)}">수정</a>
      <button type="button" class="btn btn-danger" data-action="delete-record">삭제</button>
    </div>

    <section class="card detail-section">
      <div class="score-summary">
        <h3 class="card-title">자기 점수</h3>
        <p class="score-average">평균 <strong>${formatScore(avg)}</strong> / 5</p>
      </div>
      ${SCORE_ITEMS.map(
        ([key, label]) => `
        <div class="score-row is-static">
          <span class="score-label">${label}</span>
          <span class="stars" aria-label="${label} ${record.scores[key]}점">${[1, 2, 3, 4, 5]
            .map((n) => `<span class="star${n <= record.scores[key] ? ' is-on' : ''}" aria-hidden="true">★</span>`)
            .join('')}</span>
          <span class="score-value">${record.scores[key]}점</span>
        </div>`,
      ).join('')}
    </section>

    ${record.good ? `<section class="card detail-section"><h3 class="card-title">잘된 점</h3><p class="detail-memo">${h(record.good)}</p></section>` : ''}
    ${record.bad ? `<section class="card detail-section"><h3 class="card-title">아쉬운 점</h3><p class="detail-memo">${h(record.bad)}</p></section>` : ''}
    ${
      selected.length
        ? `<section class="card detail-section"><h3 class="card-title">실패 노트</h3>${selected.map(troubleDetailHtml).join('')}</section>`
        : ''
    }`;

  els.detail.querySelector('[data-action="delete-record"]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '이 기록을 삭제할까요?',
      message: `${formatDate(record.date)} ${itemNameOf(record)} 기록이 사진과 함께 지워져요. 되돌릴 수 없어요.`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(STORES.records, record.id);
    } catch (err) {
      console.error(err);
      return;
    }
    location.replace('#records');
  });
}

/* ===== 화면 전환 ===== */

function showView(name) {
  els.gallery.hidden = name !== 'gallery';
  els.form.hidden = name !== 'form';
  els.detail.hidden = name !== 'detail';
}

export async function showRecords(params = []) {
  try {
    await refreshItems(); // 품목 이름과 직접 추가의 품목 목록에 쓴다
  } catch (err) {
    console.error(err);
  }
  const [first, second] = params;

  if (first === 'new') {
    if (second === 'practice') {
      const result = getPracticeResult();
      if (!result) {
        location.replace('#records');
        return;
      }
      form = {
        mode: 'practice',
        draft: newDraft({ ...result, entry: 'practice', date: toDateString(new Date(result.endedAt)) }),
        errors: new Map(),
      };
    } else {
      form = { mode: 'manual', draft: newDraft({ entry: 'manual' }), errors: new Map() };
    }
    showView('form');
    await renderForm();
    return;
  }

  if (first === 'edit') {
    const record = await getById(STORES.records, second).catch(() => null);
    if (!record) {
      location.replace('#records');
      return;
    }
    form = { mode: 'edit', draft: draftFromRecord(record), errors: new Map() };
    showView('form');
    await renderForm();
    return;
  }

  if (first) {
    const record = await getById(STORES.records, first).catch(() => null);
    if (!record) {
      location.replace('#records');
      return;
    }
    showView('detail');
    await renderDetail(record);
    return;
  }

  showView('gallery');
  await renderGallery();
}

export function initRecords() {
  els.gallery = document.getElementById('records-gallery-view');
  els.form = document.getElementById('records-form-view');
  els.detail = document.getElementById('records-detail-view');

  els.form.addEventListener('click', handleFormClick);
  els.form.addEventListener('input', handleFormInput);
  els.form.addEventListener('change', (event) => {
    if (event.target.matches('[data-photos]')) handlePhotos(event.target);
    if (event.target.matches('select[data-bind]')) handleFormInput(event);
  });
  els.gallery.addEventListener('change', (event) => {
    if (!event.target.matches('[data-gallery-filter]')) return;
    galleryFilter = event.target.value;
    renderGallery();
  });
}
