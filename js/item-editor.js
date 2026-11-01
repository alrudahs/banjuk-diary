// 내 품목 추가·수정·복사 화면 (S-09, F-19~F-21). 삭제는 품목 상세(items.js)에 있다.
// 입력 중인 값은 draft에 모아 두고, 저장할 때 prd 7.1 품목 구조로 바꿔 IndexedDB에 넣는다.

import { save, STORES } from './db.js';
import { resizeImage, ACCEPT_TYPES } from './image.js';
import { FLOUR_RANGE, PIECES_RANGE, resetCalcState } from './calculator.js';
import { escapeHtml as h } from './utils.js';

const VALUE_FIELD = { percent: 'percent', perPiece: 'gramPerPiece', fixed: 'gram' };
const BASIS_OPTIONS = [
  ['percent', '밀가루 기준 비율(%)'],
  ['perPiece', '개당 무게(g) × 개수'],
  ['fixed', '고정 무게(g)'],
];
const VALUE_UNIT = { percent: '%', perPiece: 'g/개', fixed: 'g' };
const LIMITS = { name: 30, memo: 500, minutes: 600 };

let container = null;
let draft = null;
let mode = 'new'; // new | edit | copy
let errors = new Map(); // 입력칸 경로 → 안내 문구
let sourceName = '';

const emptyIngredient = () => ({ name: '', value: '' });
const emptyStep = () => ({ name: '', minutes: '', desc: '', tip: '', parallel: '' });
const emptyGroup = (name = '') => ({ name, basis: 'percent', ingredients: [emptyIngredient()] });

/* ===== 입력값 준비 ===== */

function draftFromItem(item) {
  return {
    id: item.id,
    type: item.type,
    category: item.category,
    name: item.name,
    examMinutes: item.examMinutes == null ? '' : String(item.examMinutes),
    method: item.method || '',
    thumbnail: item.thumbnail || null,
    photoCredit: item.photoCredit || null,
    video: item.video || null,
    requirements: [...(item.requirements || [])],
    notes: [...(item.notes || [])],
    criteria: [...(item.criteria || [])],
    memo: item.memo || '',
    baseFlourGram: item.baseFlourGram == null ? '1000' : String(item.baseFlourGram),
    basePieces: item.basePieces == null ? '10' : String(item.basePieces),
    groups: item.ingredientGroups.map((group) => ({
      name: group.name,
      basis: group.basis,
      ingredients: group.ingredients.map((ing) => ({ name: ing.name, value: String(ing[VALUE_FIELD[group.basis]] ?? '') })),
    })),
    steps: item.steps.map((step) => ({
      name: step.name,
      minutes: step.minutes == null ? '' : String(step.minutes),
      desc: step.desc || '',
      tip: step.tip || '',
      parallel: step.parallel || '',
    })),
    copiedFrom: item.copiedFrom || null,
    createdAt: item.createdAt || null,
  };
}

function newDraft(category) {
  return {
    id: null,
    type: '일반',
    category,
    name: '',
    examMinutes: '',
    method: '',
    thumbnail: null,
    photoCredit: null,
    video: null,
    requirements: [],
    notes: [],
    criteria: [],
    memo: '',
    baseFlourGram: '1000',
    basePieces: '10',
    groups: [emptyGroup('반죽')],
    steps: [emptyStep()],
    copiedFrom: null,
    createdAt: null,
  };
}

/** "groups.0.ingredients.1.value" 같은 경로로 draft 값을 바꾼다 */
function setPath(path, value) {
  const keys = path.split('.');
  let target = draft;
  keys.slice(0, -1).forEach((key) => {
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
}

/* ===== 검사 (prd 5.3) ===== */

const isBlank = (v) => String(v ?? '').trim() === '';
const isIntIn = (v, min, max) => /^\d+$/.test(String(v).trim()) && Number(v) >= min && Number(v) <= max;
const isPositiveNumber = (v) => !isBlank(v) && Number.isFinite(Number(v)) && Number(v) > 0;

function validate() {
  const found = new Map();
  const add = (path, message) => {
    if (!found.has(path)) found.set(path, message);
  };

  if (isBlank(draft.name)) add('name', '이름을 입력해 주세요.');
  else if (draft.name.trim().length > LIMITS.name) add('name', `이름은 ${LIMITS.name}자 이내로 써 주세요.`);

  const timeLabel = draft.type === '실기' ? '시험 시간' : '목표 시간';
  if (draft.type === '실기' && isBlank(draft.examMinutes)) add('examMinutes', '실기 품목은 시험 시간이 꼭 필요해요.');
  else if (!isBlank(draft.examMinutes) && !isIntIn(draft.examMinutes, 1, LIMITS.minutes)) {
    add('examMinutes', `${timeLabel}은 1~${LIMITS.minutes}분 사이의 정수로 입력해 주세요.`);
  }

  if (draft.groups.length === 0) add('groups', '재료 묶음을 하나 이상 만들어 주세요.');
  draft.groups.forEach((group, gi) => {
    const label = `${gi + 1}번째 묶음`;
    if (isBlank(group.name)) add(`groups.${gi}.name`, `${label}의 이름을 입력해 주세요.`);
    if (group.ingredients.length === 0) add(`groups.${gi}.ingredients`, `${label}에 재료를 하나 이상 넣어 주세요.`);
    group.ingredients.forEach((ing, ii) => {
      const ingLabel = `${group.name.trim() || label}의 ${ii + 1}번째 재료`;
      if (isBlank(ing.name)) add(`groups.${gi}.ingredients.${ii}.name`, `${ingLabel} 이름을 입력해 주세요.`);
      if (!isPositiveNumber(ing.value)) add(`groups.${gi}.ingredients.${ii}.value`, `${ingLabel} 값은 0보다 큰 숫자로 입력해 주세요.`);
    });
  });

  if (draft.groups.some((g) => g.basis === 'percent') && !isIntIn(draft.baseFlourGram, FLOUR_RANGE.min, FLOUR_RANGE.max)) {
    add('baseFlourGram', `기준 밀가루 무게는 ${FLOUR_RANGE.min}~${FLOUR_RANGE.max.toLocaleString()}g 사이로 입력해 주세요.`);
  }
  if (draft.groups.some((g) => g.basis === 'perPiece') && !isIntIn(draft.basePieces, PIECES_RANGE.min, PIECES_RANGE.max)) {
    add('basePieces', `기준 개수는 ${PIECES_RANGE.min}~${PIECES_RANGE.max}개 사이의 정수로 입력해 주세요.`);
  }

  if (draft.steps.length === 0) add('steps', '만드는 순서를 한 단계 이상 넣어 주세요.');
  draft.steps.forEach((step, si) => {
    if (isBlank(step.name)) add(`steps.${si}.name`, `${si + 1}번째 단계 이름을 입력해 주세요.`);
    if (!isBlank(step.minutes) && !isIntIn(step.minutes, 1, LIMITS.minutes)) {
      add(`steps.${si}.minutes`, `${si + 1}번째 단계 시간은 1~${LIMITS.minutes}분 사이의 정수로 입력하거나 비워 두세요.`);
    }
  });

  if (draft.memo.length > LIMITS.memo) add('memo', `메모는 ${LIMITS.memo}자 이내로 써 주세요.`);
  return found;
}

/** draft를 prd 7.1 품목 구조로 바꾼다 */
function toItem() {
  const now = new Date().toISOString();
  const hasPercent = draft.groups.some((g) => g.basis === 'percent');
  const hasPerPiece = draft.groups.some((g) => g.basis === 'perPiece');
  return {
    id: draft.id || `my-${Date.now()}`,
    type: draft.type,
    source: '내 품목',
    category: draft.category,
    name: draft.name.trim(),
    examMinutes: isBlank(draft.examMinutes) ? null : Number(draft.examMinutes),
    method: draft.method.trim(),
    thumbnail: draft.thumbnail,
    photoCredit: draft.thumbnail ? draft.photoCredit : null,
    video: draft.video,
    requirements: draft.requirements,
    notes: draft.notes,
    criteria: draft.criteria,
    memo: draft.memo.trim(),
    baseFlourGram: hasPercent ? Number(draft.baseFlourGram) : null,
    basePieces: hasPerPiece ? Number(draft.basePieces) : null,
    ingredientGroups: draft.groups.map((group) => ({
      name: group.name.trim(),
      basis: group.basis,
      ingredients: group.ingredients.map((ing) => ({ name: ing.name.trim(), [VALUE_FIELD[group.basis]]: Number(ing.value) })),
    })),
    steps: draft.steps.map((step) => ({
      name: step.name.trim(),
      minutes: isBlank(step.minutes) ? null : Number(step.minutes),
      desc: step.desc.trim(),
      tip: step.tip.trim(),
      parallel: step.parallel.trim(),
    })),
    copiedFrom: draft.copiedFrom,
    createdAt: draft.createdAt || now,
    updatedAt: now,
  };
}

/* ===== 화면 ===== */

const errClass = (path) => (errors.has(path) ? ' is-error' : '');
const errText = (path) => (errors.has(path) ? `<p class="field-error">${h(errors.get(path))}</p>` : '');

function textInput(path, value, { label, placeholder = '', inputmode = 'text', maxlength, hint = '', hiddenLabel = false } = {}) {
  return `
    <label class="field">
      <span class="field-label${hiddenLabel ? ' visually-hidden' : ''}">${label}</span>
      <input class="input${errClass(path)}" data-bind="${path}" value="${h(value)}" placeholder="${h(placeholder)}"
             inputmode="${inputmode}" autocomplete="off"${maxlength ? ` maxlength="${maxlength}"` : ''}>
      ${hint ? `<p class="field-hint">${hint}</p>` : ''}
      ${errText(path)}
    </label>`;
}

function choiceButtons(path, current, options, label) {
  return `
    <div class="field">
      <span class="field-label">${label}</span>
      <div class="segmented" role="group" aria-label="${label}">
        ${options
          .map(
            (value) =>
              `<button type="button" class="segmented-btn" data-action="set" data-path="${path}" data-value="${value}" aria-pressed="${value === current}">${value}</button>`,
          )
          .join('')}
      </div>
    </div>`;
}

function basicsHtml() {
  const timeLabel = draft.type === '실기' ? '시험 시간 (분)' : '목표 시간 (분, 선택)';
  return `
    <section class="card editor-section">
      <h3 class="card-title">기본 정보</h3>
      ${textInput('name', draft.name, { label: '이름', placeholder: '예: 휘낭시에', maxlength: LIMITS.name })}
      ${choiceButtons('category', draft.category, ['제빵', '제과'], '분류')}
      ${choiceButtons('type', draft.type, ['실기', '일반'], '종류')}
      ${textInput('examMinutes', draft.examMinutes, {
        label: timeLabel,
        placeholder: draft.type === '실기' ? '예: 180' : '비워 두면 경과 시간만 보여요',
        inputmode: 'numeric',
      })}
      ${textInput('method', draft.method, { label: '반죽법 (선택)', placeholder: '예: 스트레이트법' })}
    </section>`;
}

function photoHtml() {
  return `
    <section class="card editor-section">
      <h3 class="card-title">대표 사진 (선택)</h3>
      ${
        draft.thumbnail
          ? `<img class="photo-preview" src="${h(draft.thumbnail)}" alt="대표 사진 미리보기">
             <div class="btn-group">
               <label class="btn btn-secondary">사진 바꾸기<input type="file" accept="${ACCEPT_TYPES.join(',')}" data-photo hidden></label>
               <button type="button" class="btn btn-danger" data-action="remove-photo">사진 빼기</button>
             </div>`
          : `<label class="btn btn-outline btn-block">+ 사진 올리기<input type="file" accept="${ACCEPT_TYPES.join(',')}" data-photo hidden></label>`
      }
      <p class="field-hint photo-status">JPG·PNG, 긴 변 1200px로 줄여서 저장해요.</p>
    </section>`;
}

function groupHtml(group, gi) {
  return `
    <div class="editor-block">
      <div class="editor-block-head">
        <strong>묶음 ${gi + 1}</strong>
        ${draft.groups.length > 1 ? `<button type="button" class="btn-text danger" data-action="remove-group" data-gi="${gi}">묶음 삭제</button>` : ''}
      </div>
      ${textInput(`groups.${gi}.name`, group.name, { label: '묶음 이름', placeholder: '예: 반죽, 토핑, 충전물' })}
      <label class="field">
        <span class="field-label">계산 방식</span>
        <select class="select" data-bind="groups.${gi}.basis" data-rerender>
          ${BASIS_OPTIONS.map(([value, text]) => `<option value="${value}"${value === group.basis ? ' selected' : ''}>${text}</option>`).join('')}
        </select>
      </label>
      <div class="field">
        <span class="field-label">재료</span>
        <ul class="ing-list">
          ${group.ingredients
            .map((ing, ii) => {
              const base = `groups.${gi}.ingredients.${ii}`;
              return `
            <li class="ing-row">
              <input class="input${errClass(`${base}.name`)}" data-bind="${base}.name" value="${h(ing.name)}" placeholder="재료 이름" aria-label="${ii + 1}번째 재료 이름" autocomplete="off">
              <span class="input-unit">
                <input class="input${errClass(`${base}.value`)}" data-bind="${base}.value" value="${h(ing.value)}" placeholder="0" inputmode="decimal" aria-label="${ii + 1}번째 재료 값">
                <span>${VALUE_UNIT[group.basis]}</span>
              </span>
              <button type="button" class="icon-btn" data-action="remove-ing" data-gi="${gi}" data-ii="${ii}" aria-label="${ii + 1}번째 재료 삭제"${group.ingredients.length === 1 ? ' disabled' : ''}>✕</button>
            </li>`;
            })
            .join('')}
        </ul>
        <button type="button" class="btn btn-secondary btn-small" data-action="add-ing" data-gi="${gi}">+ 재료 추가</button>
      </div>
    </div>`;
}

function ingredientsHtml() {
  const hasPercent = draft.groups.some((g) => g.basis === 'percent');
  const hasPerPiece = draft.groups.some((g) => g.basis === 'perPiece');
  return `
    <section class="card editor-section">
      <h3 class="card-title">재료 묶음</h3>
      ${errText('groups')}
      ${
        hasPercent || hasPerPiece
          ? `<div class="calc-inputs">
              ${hasPercent ? textInput('baseFlourGram', draft.baseFlourGram, { label: '기준 밀가루 무게 (g)', inputmode: 'numeric', hint: `${FLOUR_RANGE.min}~${FLOUR_RANGE.max.toLocaleString()}g` }) : ''}
              ${hasPerPiece ? textInput('basePieces', draft.basePieces, { label: '기준 개수', inputmode: 'numeric', hint: `${PIECES_RANGE.min}~${PIECES_RANGE.max}개` }) : ''}
            </div>`
          : ''
      }
      ${draft.groups.map(groupHtml).join('')}
      <button type="button" class="btn btn-outline btn-block" data-action="add-group">+ 묶음 추가</button>
    </section>`;
}

function stepsHtml() {
  return `
    <section class="card editor-section">
      <h3 class="card-title">만드는 순서</h3>
      <p class="field-hint">시간을 비워 두면 연습 모드에서 스톱워치로 재요.</p>
      ${errText('steps')}
      ${draft.steps
        .map(
          (step, si) => `
        <div class="editor-block">
          <div class="editor-block-head">
            <strong>${si + 1}단계</strong>
            ${draft.steps.length > 1 ? `<button type="button" class="btn-text danger" data-action="remove-step" data-si="${si}">단계 삭제</button>` : ''}
          </div>
          <div class="step-fields">
            ${textInput(`steps.${si}.name`, step.name, { label: '단계 이름', placeholder: '예: 1차 발효' })}
            ${textInput(`steps.${si}.minutes`, step.minutes, { label: '시간 (분)', placeholder: '비워도 돼요', inputmode: 'numeric' })}
          </div>
          ${textInput(`steps.${si}.desc`, step.desc, { label: '설명 (선택)', placeholder: '이 단계에서 하는 일' })}
          ${textInput(`steps.${si}.tip`, step.tip, { label: '포인트 (선택)', placeholder: '예: 반죽 온도 27℃' })}
          ${textInput(`steps.${si}.parallel`, step.parallel, { label: '동시 진행 메모 (선택)', placeholder: '예: 토핑 만들기' })}
        </div>`,
        )
        .join('')}
      <button type="button" class="btn btn-outline btn-block" data-action="add-step">+ 단계 추가</button>
    </section>`;
}

function memoHtml() {
  return `
    <section class="card editor-section">
      <label class="field">
        <span class="field-label">메모 (선택)</span>
        <textarea class="textarea${errClass('memo')}" data-bind="memo" maxlength="${LIMITS.memo}" placeholder="나만 알아볼 메모">${h(draft.memo)}</textarea>
        <p class="field-hint">${LIMITS.memo}자 이내</p>
        ${errText('memo')}
      </label>
    </section>`;
}

function cancelHref() {
  if (mode === 'edit') return `#items/${encodeURIComponent(draft.id)}`;
  if (mode === 'copy') return `#items/${encodeURIComponent(draft.copiedFrom)}`;
  return '#items';
}

function render() {
  const title = mode === 'edit' ? '내 품목 수정' : mode === 'copy' ? '복사해서 내 품목 만들기' : '품목 추가';
  container.innerHTML = `
    <a class="btn btn-secondary back-btn" href="${cancelHref()}">← 취소</a>
    <h2 class="screen-title editor-title">${title}</h2>
    ${mode === 'copy' ? `<p class="editor-note">"${h(sourceName)}"의 내용을 모두 가져왔어요. 고쳐도 원래 품목은 바뀌지 않아요.</p>` : ''}
    ${
      errors.size
        ? `<div class="card editor-errors" role="alert">
            <strong>고쳐야 할 곳이 ${errors.size}개 있어요</strong>
            <ul>${[...errors.values()].map((msg) => `<li>${h(msg)}</li>`).join('')}</ul>
          </div>`
        : ''
    }
    ${basicsHtml()}
    ${photoHtml()}
    ${ingredientsHtml()}
    ${stepsHtml()}
    ${memoHtml()}
    <div class="btn-group editor-actions">
      <a class="btn btn-secondary" href="${cancelHref()}">취소</a>
      <button type="button" class="btn btn-primary btn-lg" data-action="save">저장</button>
    </div>`;
}

/* ===== 동작 ===== */

async function handleSave(button) {
  errors = validate();
  if (errors.size) {
    render();
    container.querySelector('.editor-errors').scrollIntoView({ block: 'start' });
    return;
  }

  const item = toItem();
  button.disabled = true;
  try {
    await save(STORES.items, item);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    errors = new Map([['save', '저장하지 못했어요. 사진이 너무 크거나 기기 저장 공간이 부족할 수 있어요.']]);
    render();
    return;
  }
  resetCalcState(item.id);
  location.replace(`#items/${encodeURIComponent(item.id)}`); // 뒤로 가기를 눌러도 편집 화면으로 돌아오지 않게
}

async function handlePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const status = container.querySelector('.photo-status');
  status.textContent = '사진을 줄이는 중이에요…';
  try {
    draft.thumbnail = await resizeImage(file);
    draft.photoCredit = null; // 내가 올린 사진이므로 출처 표시가 필요 없다
    render();
  } catch (err) {
    status.textContent = err.message;
    status.classList.add('field-error');
  }
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  const gi = Number(button.dataset.gi);

  if (action === 'save') {
    handleSave(button);
    return;
  }
  if (action === 'set') setPath(button.dataset.path, button.dataset.value);
  if (action === 'remove-photo') {
    draft.thumbnail = null;
    draft.photoCredit = null;
  }
  if (action === 'add-group') draft.groups.push(emptyGroup());
  if (action === 'remove-group') draft.groups.splice(gi, 1);
  if (action === 'add-ing') draft.groups[gi].ingredients.push(emptyIngredient());
  if (action === 'remove-ing') draft.groups[gi].ingredients.splice(Number(button.dataset.ii), 1);
  if (action === 'add-step') draft.steps.push(emptyStep());
  if (action === 'remove-step') draft.steps.splice(Number(button.dataset.si), 1);

  // 칸이 늘거나 줄면 경로가 바뀌므로 지난 안내 문구는 지운다
  if (action.startsWith('add-') || action.startsWith('remove-')) errors = new Map();
  render();
}

function handleInput(event) {
  const { bind } = event.target.dataset;
  if (!bind) return;
  setPath(bind, event.target.value);
  if (event.target.hasAttribute('data-rerender')) render();
}

/**
 * 편집 화면을 연다.
 *   openEditor(el, 'new', null, { category })   : 새 품목
 *   openEditor(el, 'edit', 내 품목)             : 수정
 *   openEditor(el, 'copy', 기본 품목)           : 복사해서 새 내 품목
 */
export function openEditor(el, nextMode, item, { category = '제빵' } = {}) {
  if (container !== el) {
    container = el;
    container.addEventListener('click', handleClick);
    container.addEventListener('input', handleInput);
    container.addEventListener('change', (event) => {
      if (event.target.matches('[data-photo]')) handlePhoto(event.target);
    });
  }

  mode = nextMode;
  errors = new Map();
  sourceName = item ? item.name : '';

  if (mode === 'new') {
    draft = newDraft(category);
  } else {
    draft = draftFromItem(item);
    if (mode === 'copy') {
      draft.id = null;
      draft.copiedFrom = item.id;
      draft.createdAt = null;
      draft.name = `${item.name} (내 레시피)`.slice(0, LIMITS.name);
    }
  }
  render();
}
