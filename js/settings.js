// 설정 화면 (S-08, F-15, F-16): 시험일, 백업 내보내기·불러오기, 전체 데이터 초기화.
// 시험일 같은 설정은 localStorage, 내 품목과 연습 기록은 IndexedDB에 있다. (prd 7장)

import { getAll, save, remove, clear, STORES } from './db.js';
import { discardPractice, clearPracticeResult } from './timer.js';
import { escapeHtml as h, confirmDialog, toDateString, formatDate } from './utils.js';
import { daysUntil, formatDday } from './stats.js';

// 발표 캡처용 샘플 데이터 버튼 (9.3의 11-3). 발표가 끝나면 false로 바꿔 숨긴다
const SHOW_SAMPLE_BUTTON = true;
const SAMPLE_PREFIX = 'sample-';

const SETTINGS_KEY = 'banjuk-settings';
const BACKUP_APP = 'banjuk-diary';
const BACKUP_VERSION = 1;

let container = null;
let message = null; // { type: 'ok' | 'error', text }

/* ===== 설정 저장 ===== */

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings(next) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getSettings(), ...next }));
    return true;
  } catch {
    return false;
  }
}

/* ===== 백업 (F-16) ===== */

async function exportBackup() {
  const [items, records] = await Promise.all([getAll(STORES.items), getAll(STORES.records)]);
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items,
    records,
  };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `banjuk-backup-${toDateString().replaceAll('-', '')}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { items: items.length, records: records.length };
}

/** 백업 파일 내용을 검사한다. 문제가 있으면 오류를 낸다 */
function parseBackup(textContent) {
  let data;
  try {
    data = JSON.parse(textContent);
  } catch {
    throw new Error('반죽일기 백업 파일이 아니에요. (파일을 읽을 수 없어요)');
  }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.items) || !Array.isArray(data.records)) {
    throw new Error('반죽일기 백업 파일이 아니에요.');
  }
  if (data.version > BACKUP_VERSION) throw new Error('더 새로운 버전의 앱에서 만든 백업이에요.');
  const badItem = data.items.find((i) => !i?.id || i.source !== '내 품목' || !Array.isArray(i.ingredientGroups) || !Array.isArray(i.steps));
  const badRecord = data.records.find((r) => !r?.id || !r.itemId || !r.date || typeof r.scores !== 'object');
  if (badItem || badRecord) throw new Error('백업 파일의 내용 일부가 올바르지 않아요.');
  return data;
}

async function importBackup(file) {
  const data = parseBackup(await file.text());
  const ok = await confirmDialog({
    title: '백업을 불러올까요?',
    message: `내 품목 ${data.items.length}개, 연습 기록 ${data.records.length}개를 불러와요. 지금 기기에 있는 내 품목과 기록은 모두 지워지고 백업 내용으로 바뀌어요.`,
    confirmLabel: '불러오기',
    danger: true,
  });
  if (!ok) return null;
  await clear(STORES.items);
  await clear(STORES.records);
  for (const item of data.items) await save(STORES.items, item);
  for (const record of data.records) await save(STORES.records, record);
  return { items: data.items.length, records: data.records.length };
}

async function resetAll() {
  const ok = await confirmDialog({
    title: '모든 데이터를 지울까요?',
    message: '내 품목, 연습 기록, 시험일, 진행 중인 연습이 모두 지워져요. 되돌릴 수 없으니 먼저 백업을 내보내 두세요.',
    confirmLabel: '모두 지우기',
    danger: true,
  });
  if (!ok) return false;
  await clear(STORES.items);
  await clear(STORES.records);
  discardPractice();
  clearPracticeResult();
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // 무시
  }
  return true;
}


/* ===== 샘플 데이터 (개발용, 11-3) ===== */

async function photoDataUrl(path) {
  const blob = await (await fetch(path)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

/** 최근 2주 안의 샘플 연습 기록 5개와 일반 내 품목 1개를 넣는다. id가 sample-로 시작한다 */
async function addSampleData() {
  const now = new Date().toISOString();
  const myItem = {
    id: `${SAMPLE_PREFIX}financier`,
    type: '일반',
    source: '내 품목',
    category: '제과',
    name: '휘낭시에',
    examMinutes: 60,
    method: '녹인 버터법',
    thumbnail: null,
    photoCredit: null,
    video: null,
    requirements: [],
    notes: ['태운 버터(브라운 버터)는 체에 걸러 따뜻할 때 넣어요'],
    criteria: [],
    memo: '샘플 품목이에요. 설정의 "샘플 지우기"로 지울 수 있어요.',
    baseFlourGram: 100,
    basePieces: null,
    ingredientGroups: [
      {
        name: '반죽',
        basis: 'percent',
        ingredients: [
          { name: '박력분', percent: 100 },
          { name: '아몬드가루', percent: 100 },
          { name: '슈거파우더', percent: 250 },
          { name: '흰자', percent: 250 },
          { name: '버터', percent: 250 },
        ],
      },
    ],
    steps: [
      { name: '브라운 버터 만들기', minutes: null, desc: '버터를 갈색이 날 때까지 끓여요', tip: '고소한 냄새가 나면 바로 불을 꺼요', parallel: '' },
      { name: '반죽', minutes: null, desc: '가루와 흰자를 섞고 버터를 넣어요', tip: '', parallel: '' },
      { name: '휴지', minutes: 30, desc: '냉장고에서 쉬게 해요', tip: '', parallel: '팬에 버터 바르기' },
      { name: '굽기', minutes: 13, desc: '200℃에서 12~14분', tip: '가장자리 색을 봐요', parallel: '' },
    ],
    copiedFrom: null,
    createdAt: now,
    updatedAt: now,
  };

  const photo = {};
  for (const id of ['bread-01', 'bread-02', 'bread-03', 'pastry-01']) {
    photo[id] = await photoDataUrl(`images/items/${id}.jpg`);
  }
  const record = (n, itemId, itemName, daysBack, scores, extra = {}) => ({
    id: `${SAMPLE_PREFIX}rec-${n}`,
    itemId,
    itemName,
    entry: 'practice',
    date: daysAgo(daysBack),
    flourGram: null,
    pieces: null,
    elapsedMinutes: 150,
    photos: photo[itemId] ? [photo[itemId]] : [],
    scores: { volume: scores[0], shape: scores[1], color: scores[2], crumb: scores[3] },
    good: '',
    bad: '',
    troubles: [],
    createdAt: now,
    ...extra,
  });
  const records = [
    record(1, 'bread-02', '단팥빵(비상스트레이트법)', 12, [3, 2, 3, 3], { bad: '앙금이 한쪽으로 쏠렸어요', troubles: ['shape-uneven'], elapsedMinutes: 185 }),
    record(2, 'bread-01', '식빵(비상스트레이트법)', 9, [4, 4, 3, 4], { good: '3봉 높이가 고르게 나왔어요', elapsedMinutes: 155 }),
    record(3, 'bread-02', '단팥빵(비상스트레이트법)', 6, [3, 3, 2, 3], { bad: '윗면 색이 연했어요', troubles: ['color-pale'], elapsedMinutes: 172 }),
    record(4, 'pastry-01', '파운드케이크', 3, [4, 4, 5, 4], { good: '윗면 터짐이 가운데로 났어요', elapsedMinutes: 140 }),
    record(5, 'bread-03', '단과자빵(소보로빵)', 1, [3, 3, 4, 3], { bad: '토핑이 조금 떨어졌어요', troubles: ['topping-falls'], elapsedMinutes: 200 }),
  ];

  await save(STORES.items, myItem);
  for (const r of records) await save(STORES.records, r);
  return { items: 1, records: records.length };
}

async function removeSampleData() {
  const [items, records] = await Promise.all([getAll(STORES.items), getAll(STORES.records)]);
  const sampleItems = items.filter((i) => i.id.startsWith(SAMPLE_PREFIX));
  const sampleRecords = records.filter((r) => r.id.startsWith(SAMPLE_PREFIX));
  for (const i of sampleItems) await remove(STORES.items, i.id);
  for (const r of sampleRecords) await remove(STORES.records, r.id);
  return { items: sampleItems.length, records: sampleRecords.length };
}

/* ===== 화면 ===== */

function render() {
  const { examDate = '' } = getSettings();
  const days = daysUntil(examDate);

  container.innerHTML = `
    <h2 class="screen-title">설정</h2>

    ${message ? `<div class="card settings-message is-${message.type}" role="status">${h(message.text)}</div>` : ''}

    <section class="card settings-section">
      <h3 class="card-title">시험일</h3>
      <label class="field">
        <span class="field-label">실기 시험 날짜</span>
        <input class="input" type="date" data-setting="examDate" value="${h(examDate)}">
      </label>
      <p class="field-hint">${examDate ? `${h(formatDate(examDate))} · 홈에 <strong>${formatDday(days)}</strong>로 보여요.` : '날짜를 넣으면 홈에 남은 날(D-day)을 보여 줘요.'}</p>
      ${examDate ? '<button type="button" class="btn-text danger" data-action="clear-exam">시험일 지우기</button>' : ''}
    </section>

    <section class="card settings-section">
      <h3 class="card-title">백업</h3>
      <p class="card-text">기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지니, 가끔 백업 파일로 내보내 두세요.</p>
      <div class="settings-actions">
        <button type="button" class="btn btn-primary btn-block" data-action="export">백업 내보내기</button>
        <label class="btn btn-outline btn-block">백업 불러오기<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <p class="field-hint">내 품목과 연습 기록(사진 포함)이 파일 하나에 담겨요.</p>
    </section>

    <section class="card settings-section">
      <h3 class="card-title">데이터 초기화</h3>
      <p class="card-text">내 품목, 연습 기록, 시험일을 모두 지우고 처음 상태로 돌려요. 기본 품목은 지워지지 않아요.</p>
      <button type="button" class="btn btn-danger btn-block" data-action="reset">전체 데이터 초기화</button>
    </section>

    ${
      SHOW_SAMPLE_BUTTON
        ? `<section class="card settings-section settings-dev">
            <h3 class="card-title">개발용: 샘플 데이터</h3>
            <p class="card-text">발표 캡처용으로 샘플 연습 기록 5개와 내 품목(휘낭시에) 1개를 넣어요. 샘플만 따로 지울 수 있어요.</p>
            <div class="btn-group">
              <button type="button" class="btn btn-secondary" data-action="add-sample">샘플 넣기</button>
              <button type="button" class="btn btn-danger" data-action="remove-sample">샘플 지우기</button>
            </div>
            <p class="field-hint">발표가 끝나면 js/settings.js 맨 위의 SHOW_SAMPLE_BUTTON을 false로 바꿔 이 칸을 숨겨요.</p>
          </section>`
        : ''
    }`;
}

function showMessage(type, text) {
  message = { type, text };
  render();
  window.scrollTo(0, 0);
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  try {
    if (action === 'clear-exam') {
      saveSettings({ examDate: '' });
      message = null;
      render();
    }
    if (action === 'export') {
      const counts = await exportBackup();
      showMessage('ok', `백업 파일을 내보냈어요. (내 품목 ${counts.items}개, 연습 기록 ${counts.records}개)`);
    }
    if (action === 'reset' && (await resetAll())) {
      showMessage('ok', '모든 데이터를 지웠어요.');
    }
    if (action === 'add-sample') {
      const counts = await addSampleData();
      showMessage('ok', `샘플을 넣었어요. (내 품목 ${counts.items}개, 연습 기록 ${counts.records}개)`);
    }
    if (action === 'remove-sample') {
      const counts = await removeSampleData();
      showMessage('ok', `샘플을 지웠어요. (내 품목 ${counts.items}개, 연습 기록 ${counts.records}개)`);
    }
  } catch (err) {
    console.error(err);
    showMessage('error', '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}

async function handleChange(event) {
  if (event.target.matches('[data-setting="examDate"]')) {
    saveSettings({ examDate: event.target.value });
    message = null;
    render();
    return;
  }
  if (event.target.matches('[data-import]')) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 고를 수 있게
    if (!file) return;
    try {
      const counts = await importBackup(file);
      if (counts) showMessage('ok', `백업을 불러왔어요. (내 품목 ${counts.items}개, 연습 기록 ${counts.records}개)`);
    } catch (err) {
      showMessage('error', err.message || '백업을 불러오지 못했어요.');
    }
  }
}

export function showSettings(el) {
  if (container !== el) {
    container = el;
    container.addEventListener('click', handleClick);
    container.addEventListener('change', handleChange);
  }
  message = null;
  render();
}
