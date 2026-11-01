// 연습 모드 (S-04, F-07~F-09).
// 숫자를 1초씩 빼는 방식이 아니라 "시작 시각"과 "일시정지한 시간"을 저장해 두고 매번 다시 계산한다. (prd 7.3)
// 그래서 화면이 꺼졌다 켜지거나 앱을 닫았다 다시 열어도 시간이 정확하다. (9.3의 7-3)
// 진행 중인 연습은 localStorage에 하나만 저장한다.
// 연습을 끝내면 결과(걸린 시간, 밀가루 무게·개수)를 저장해 두고 기록 작성 화면(#records/new/practice)으로 넘어간다.

import { confirmDialog, escapeHtml as h, formatMinutes, formatDate } from './utils.js';

const STORAGE_KEY = 'banjuk-practice';
const RESULT_KEY = 'banjuk-practice-result';
const TICK_MS = 250;

let session = null; // 진행 중인 연습
let container = null;
let tickTimer = null;
let structureKey = '';
let wakeLock = null;
let audioCtx = null;
let toastTimer = null;

/* ===== 저장 ===== */

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 저장할 수 없어도 화면이 열려 있는 동안은 계속 동작한다
  }
}

/** 진행 중인 연습. 없으면 null */
export function getActiveSession() {
  if (!session) session = loadSession();
  return session;
}

/**
 * 연습을 시작한다. flourGram, pieces는 계산기 값 (기록에 자동으로 넣는다).
 * lastNote는 같은 품목의 지난 실패 노트로, 연습 화면 맨 위에 먼저 보여 준다 (F-13)
 */
export function startPractice(item, { flourGram = null, pieces = null, lastNote = null } = {}) {
  const now = Date.now();
  const { thumbnail, ...snapshot } = item; // 품목이 나중에 바뀌거나 지워져도 연습은 이어지도록 복사해 둔다
  session = {
    item: snapshot,
    startedAt: now,
    stepIndex: 0,
    stepStartedAt: now,
    pausedAt: null,
    pausedTotal: 0,
    stepPausedTotal: 0,
    allDone: false,
    flourGram,
    pieces,
    lastNote,
    noteSeen: !lastNote,
  };
  clearPracticeResult();
  persist();
  unlockAudio();
}

/** 진행 중인 연습을 기록 없이 버린다 */
export function discardPractice() {
  session = null;
  persist();
  releaseWakeLock();
}

/** 방금 끝낸 연습 결과 (기록 작성 화면에서 쓴다). 없으면 null */
export function getPracticeResult() {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPracticeResult() {
  try {
    localStorage.removeItem(RESULT_KEY);
  } catch {
    // 무시
  }
}

/* ===== 시간 계산 ===== */

const effectiveNow = () => session.pausedAt ?? Date.now();
const elapsedMs = () => effectiveNow() - session.startedAt - session.pausedTotal;
const stepElapsedMs = () => effectiveNow() - session.stepStartedAt - session.stepPausedTotal;
const currentStep = () => session.item.steps[session.stepIndex];
const isCountdown = (step) => Number.isFinite(step?.minutes);

/** 72000 → "01:12", 4000000 → "1:06:40" */
export function formatClock(ms) {
  const total = Math.floor(Math.abs(ms) / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

/** endedAt(실제 시각)에 지금 단계를 끝내고 다음 단계로 넘어간다 */
function goNext(endedAt) {
  if (session.stepIndex >= session.item.steps.length - 1) {
    session.allDone = true;
  } else {
    session.stepIndex += 1;
  }
  session.stepStartedAt = endedAt;
  session.stepPausedTotal = 0;
}

/**
 * 시간이 다 된 카운트다운 단계를 넘긴다. 앱을 오래 닫아 두었다면 여러 단계를 한 번에 넘기고,
 * 각 단계가 실제로 끝난 시각부터 다음 단계를 잰다. 넘긴 단계 이름을 돌려준다.
 */
function catchUp() {
  const finished = [];
  while (!session.allDone && !session.pausedAt) {
    const step = currentStep();
    if (!isCountdown(step)) break;
    const duration = step.minutes * 60000;
    if (stepElapsedMs() < duration) break;
    finished.push(step.name);
    goNext(session.stepStartedAt + session.stepPausedTotal + duration);
  }
  if (finished.length) persist();
  return finished;
}

/* ===== 알림 (소리·진동) ===== */

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.35, 0.7].forEach((offset) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.5, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.28);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.3);
  });
}

function showToast(message) {
  const toast = container?.querySelector('.practice-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

function alertStepEnd(finishedNames) {
  beep();
  try {
    // 화면을 한 번도 누르지 않았으면 브라우저가 진동을 막으므로 건너뛴다
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate([300, 150, 300, 150, 300]);
  } catch {
    // 진동을 지원하지 않는 기기 (아이폰 등)
  }
  const next = session.allDone ? '모든 단계를 마쳤어요' : `다음: ${currentStep().name}`;
  showToast(`${finishedNames[finishedNames.length - 1]} 끝! ${next}`);
}

/* ===== 화면 꺼짐 방지 (F-09) ===== */

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !session || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      updateWakeStatus();
    });
  } catch {
    wakeLock = null; // 지원하지 않거나 배터리 절약 모드면 그냥 넘어간다
  }
  updateWakeStatus();
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function updateWakeStatus() {
  const el = container?.querySelector('.practice-wake');
  if (el) el.hidden = !wakeLock;
}

/* ===== 화면 ===== */

function stepTextHtml(step) {
  return `
    ${step.desc ? `<p class="practice-desc">${h(step.desc)}</p>` : ''}
    ${step.tip ? `<p class="step-note step-tip"><strong>포인트</strong> ${h(step.tip)}</p>` : ''}
    ${step.parallel ? `<p class="step-note step-parallel"><strong>동시 진행</strong> ${h(step.parallel)}</p>` : ''}`;
}

// 지난 실패 노트 (F-13). "확인했어요"를 누를 때까지 맨 위에 보여 준다
function lastNoteHtml() {
  const note = session.lastNote;
  if (!note || session.noteSeen) return '';
  return `
    <div class="card last-note">
      <p class="practice-label">지난 연습 실패 노트 · ${h(formatDate(note.date))}</p>
      ${
        note.troubles.length
          ? `<ul class="last-note-list">${note.troubles
              .map((t) => `<li><strong>${h(t.symptom)}</strong>${t.fixes.length ? ` → ${h(t.fixes.join(', '))}` : ''}</li>`)
              .join('')}</ul>`
          : ''
      }
      ${note.bad ? `<p class="last-note-bad"><strong>아쉬운 점</strong> ${h(note.bad)}</p>` : ''}
      <button type="button" class="btn btn-secondary btn-block btn-small" data-practice="note-seen">확인했어요</button>
    </div>`;
}

function renderStructure() {
  const { item } = session;
  const steps = item.steps;
  const step = currentStep();
  const next = steps[session.stepIndex + 1];
  const paused = Boolean(session.pausedAt);
  const countdown = isCountdown(step);
  const hasLimit = Number.isFinite(item.examMinutes);

  const current = session.allDone
    ? `
      <div class="card practice-card is-done">
        <p class="practice-label">모든 단계 완료</p>
        <h2 class="practice-step">수고했어요!</h2>
        <p class="practice-desc">'연습 끝내기'를 누르면 전체 시간이 멈춰요.</p>
      </div>`
    : `
      <div class="card practice-card${paused ? ' is-paused' : ''}">
        <p class="practice-label">${session.stepIndex + 1} / ${steps.length}단계</p>
        <h2 class="practice-step">${h(step.name)}</h2>
        <p class="practice-timer" data-t="step">00:00</p>
        <p class="practice-timer-label">${paused ? '일시정지됨' : countdown ? `남은 시간 · ${formatMinutes(step.minutes)}` : "지난 시간 · 끝나면 '완료'를 눌러요"}</p>
        ${countdown ? '<div class="bar"><span data-t="stepbar"></span></div>' : ''}
        ${stepTextHtml(step)}
      </div>
      ${
        next
          ? `<p class="practice-next">다음: <strong>${h(next.name)}</strong> · ${isCountdown(next) ? formatMinutes(next.minutes) : '끝나면 완료'}</p>`
          : '<p class="practice-next">마지막 단계예요</p>'
      }`;

  const nextLabel = countdown ? '다음 단계 →' : '완료 →';

  container.innerHTML = `
    <div class="practice">
      <div class="practice-top">
        <p class="practice-item">${h(item.name)}</p>
        <span class="badge badge-count practice-wake" hidden>화면 꺼짐 방지 켜짐</span>
      </div>

      ${lastNoteHtml()}

      ${current}

      <div class="card practice-total">
        <div class="practice-total-head">
          <span>전체 경과</span>
          <strong data-t="elapsed">00:00</strong>
        </div>
        ${hasLimit ? '<div class="bar bar-total"><span data-t="totalbar"></span></div><p class="practice-remain" data-t="remain"></p>' : ''}
      </div>

      <div class="practice-actions">
        ${
          session.allDone
            ? '<button type="button" class="btn btn-primary btn-lg btn-block" data-practice="end">연습 끝내기</button>'
            : `
          <div class="btn-group">
            <button type="button" class="btn btn-secondary btn-lg" data-practice="pause">${paused ? '▶ 계속' : '❚❚ 일시정지'}</button>
            <button type="button" class="btn btn-primary btn-lg" data-practice="next">${nextLabel}</button>
          </div>
          <button type="button" class="btn btn-danger btn-block" data-practice="end">연습 끝내기</button>`
        }
      </div>

      <div class="practice-toast" role="status" hidden></div>
    </div>`;
  updateWakeStatus();
}

function updateNumbers() {
  const { item } = session;
  const t = (name) => container.querySelector(`[data-t="${name}"]`);

  if (!session.allDone) {
    const step = currentStep();
    const stepMs = stepElapsedMs();
    if (isCountdown(step)) {
      const duration = step.minutes * 60000;
      t('step').textContent = formatClock(Math.max(0, duration - stepMs));
      t('stepbar').style.width = `${Math.min(100, (stepMs / duration) * 100)}%`;
    } else {
      t('step').textContent = formatClock(stepMs);
    }
  }

  const elapsed = elapsedMs();
  t('elapsed').textContent = formatClock(elapsed);

  if (Number.isFinite(item.examMinutes)) {
    const limit = item.examMinutes * 60000;
    const over = elapsed > limit;
    const bar = t('totalbar');
    bar.style.width = `${Math.min(100, (elapsed / limit) * 100)}%`;
    bar.parentElement.classList.toggle('is-over', over);
    const label = item.type === '실기' ? '시험 시간' : '목표 시간';
    const remain = t('remain');
    remain.textContent = over
      ? `${label} ${formatMinutes(item.examMinutes)} 초과 +${formatClock(elapsed - limit)}`
      : `${label} ${formatMinutes(item.examMinutes)} 중 남은 ${formatClock(limit - elapsed)}`;
    remain.classList.toggle('is-over', over);
    t('elapsed').classList.toggle('is-over', over);
  }
}

function tick() {
  if (!session || !container) return;
  const finished = catchUp();
  const key = `${session.stepIndex}|${session.allDone}|${Boolean(session.pausedAt)}|${session.noteSeen}`;
  if (key !== structureKey) {
    structureKey = key;
    renderStructure();
  }
  updateNumbers();
  if (finished.length) alertStepEnd(finished);
}

/* ===== 버튼 ===== */

function togglePause() {
  const now = Date.now();
  if (session.pausedAt) {
    const pausedFor = now - session.pausedAt;
    session.pausedTotal += pausedFor;
    session.stepPausedTotal += pausedFor;
    session.pausedAt = null;
  } else {
    catchUp(); // 멈추기 직전에 끝난 단계가 있으면 먼저 넘긴다
    session.pausedAt = now;
  }
  persist();
  tick();
}

function nextStep() {
  goNext(effectiveNow());
  persist();
  tick();
}

async function endPractice() {
  const ok = await confirmDialog({
    title: '연습을 끝낼까요?',
    message: session.allDone ? '전체 시간이 멈춰요.' : '아직 남은 단계가 있어요. 끝내면 전체 시간이 멈춰요.',
    confirmLabel: '끝내기',
  });
  if (!ok || !session) return;

  const elapsed = elapsedMs();
  const result = {
    itemId: session.item.id,
    itemName: session.item.name,
    elapsedMs: elapsed,
    elapsedMinutes: Math.max(1, Math.round(elapsed / 60000)),
    flourGram: session.flourGram,
    pieces: session.pieces,
    endedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  } catch {
    // 저장하지 못해도 기록 화면은 연다 (걸린 시간은 직접 넣으면 된다)
  }
  discardPractice();
  stopTicker();
  location.hash = '#records/new/practice'; // 기록 작성으로 (F-10)
}

function handleClick(event) {
  unlockAudio(); // 소리는 사용자가 화면을 누른 뒤에만 낼 수 있다
  const button = event.target.closest('[data-practice]');
  if (!button || !session) return;
  const action = button.dataset.practice;
  if (action === 'pause') togglePause();
  if (action === 'next') nextStep();
  if (action === 'end') endPractice();
  if (action === 'note-seen') {
    session.noteSeen = true;
    persist();
    tick();
  }
}

/* ===== 화면 전환 ===== */

function stopTicker() {
  clearInterval(tickTimer);
  tickTimer = null;
}

/** 연습 화면을 연다 (#practice) */
export function showPractice(el) {
  if (container !== el) {
    container = el;
    container.addEventListener('click', handleClick);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !tickTimer) return;
      requestWakeLock(); // 화면을 다시 켜면 꺼짐 방지도 다시 켠다
      tick(); // 돌아오자마자 시간을 다시 계산한다
    });
  }

  getActiveSession();
  if (!session) {
    location.replace(getPracticeResult() ? '#records/new/practice' : '#items');
    return;
  }

  structureKey = '';
  stopTicker();
  tick();
  tickTimer = setInterval(tick, TICK_MS);
  requestWakeLock();
}

/** 연습 화면을 떠날 때 (연습은 계속 진행되고, 돌아오면 이어서 보여 준다) */
export function hidePractice() {
  stopTicker();
  releaseWakeLock();
}
