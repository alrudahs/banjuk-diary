// 배합 계산 (prd 7.3)과 배합표 계산기·계량 체크 화면 (F-04, F-05).
// calcGroups는 기본 레시피(F-18)도 같이 쓴다.

import { escapeHtml as h, formatNumber } from './utils.js';

export const FLOUR_RANGE = { min: 100, max: 3000 };
export const PIECES_RANGE = { min: 1, max: 100 };

/** 재료 하나의 무게(g). 1g 단위 반올림 */
function gramOf(basis, ingredient, flourGram, pieces) {
  if (basis === 'percent') return Math.round((flourGram * ingredient.percent) / 100);
  if (basis === 'perPiece') return Math.round(ingredient.gramPerPiece * pieces);
  return Math.round(ingredient.gram);
}

/**
 * 품목의 모든 재료 묶음 무게를 계산한다.
 * flourGram, pieces를 주지 않으면 품목의 기준값(baseFlourGram, basePieces)으로 계산한다.
 * 결과: { groups: [{ name, basis, rows: [{ name, ingredient, gram }], subtotal }], total }
 */
export function calcGroups(item, flourGram = item.baseFlourGram, pieces = item.basePieces) {
  const groups = (item.ingredientGroups || []).map((group) => {
    const rows = group.ingredients.map((ingredient) => ({
      name: ingredient.name,
      ingredient,
      gram: gramOf(group.basis, ingredient, flourGram, pieces),
    }));
    return {
      name: group.name,
      basis: group.basis,
      rows,
      subtotal: rows.reduce((sum, row) => sum + row.gram, 0),
    };
  });

  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.subtotal, 0),
  };
}

/** 품목에 해당 계산 방식의 묶음이 있는지 */
export function hasBasis(item, basis) {
  return (item.ingredientGroups || []).some((group) => group.basis === basis);
}

/** 재료 옆에 보여 줄 비율·개당·고정 표시 */
export function ingredientValueLabel(basis, ingredient) {
  if (basis === 'percent') return `${ingredient.percent}%`;
  if (basis === 'perPiece') return `개당 ${ingredient.gramPerPiece}g`;
  return '고정';
}

/* ===== 배합표 계산기 화면 ===== */

// 품목별 계산기 값과 계량 체크. 상세 화면을 다시 열어도 유지되고, 연습 기록(F-10)이 밀가루 무게·개수를 가져다 쓴다
const calcState = new Map();

function stateFor(item) {
  if (!calcState.has(item.id)) {
    calcState.set(item.id, {
      flourGram: item.baseFlourGram,
      pieces: item.basePieces,
      checked: new Set(),
    });
  }
  return calcState.get(item.id);
}

/** 연습 기록에 넣을 계산기 값. 해당 묶음이 없으면 null */
export function getCalcValues(item) {
  const state = stateFor(item);
  return {
    flourGram: hasBasis(item, 'percent') ? state.flourGram : null,
    pieces: hasBasis(item, 'perPiece') ? state.pieces : null,
  };
}

function isValidFlour(value) {
  return Number.isFinite(value) && value >= FLOUR_RANGE.min && value <= FLOUR_RANGE.max;
}

function isValidPieces(value) {
  return Number.isInteger(value) && value >= PIECES_RANGE.min && value <= PIECES_RANGE.max;
}

function inputField({ key, label, value, unit, range, base, inputmode }) {
  return `
    <label class="field" data-field="${key}">
      <span class="field-label">${label}</span>
      <span class="input-unit">
        <input class="input" type="number" inputmode="${inputmode}" min="${range.min}" max="${range.max}" step="1"
               value="${h(value)}" data-calc="${key}">
        <span>${unit}</span>
      </span>
      <p class="field-hint" data-default-hint="${formatNumber(range.min)}~${formatNumber(range.max)}${unit} · 기준 ${formatNumber(base)}${unit}">
        ${formatNumber(range.min)}~${formatNumber(range.max)}${unit} · 기준 ${formatNumber(base)}${unit}
      </p>
    </label>`;
}

export function calculatorHtml(item) {
  const state = stateFor(item);
  const totalCount = (item.ingredientGroups || []).reduce((n, g) => n + g.ingredients.length, 0);

  const inputs = [
    hasBasis(item, 'percent') &&
      inputField({ key: 'flour', label: '밀가루 무게', value: state.flourGram, unit: 'g', range: FLOUR_RANGE, base: item.baseFlourGram, inputmode: 'numeric' }),
    hasBasis(item, 'perPiece') &&
      inputField({ key: 'pieces', label: '개수', value: state.pieces, unit: '개', range: PIECES_RANGE, base: item.basePieces, inputmode: 'numeric' }),
  ].filter(Boolean);

  const groups = (item.ingredientGroups || [])
    .map(
      (group, gi) => `
      <div class="calc-group">
        <h4 class="calc-group-title">${h(group.name)} <span data-group-basis="${gi}"></span></h4>
        <ul class="calc-list">
          ${group.ingredients
            .map((ingredient, ii) => {
              const key = `${gi}-${ii}`;
              return `
            <li>
              <label class="calc-row${state.checked.has(key) ? ' is-checked' : ''}">
                <input type="checkbox" data-check="${key}"${state.checked.has(key) ? ' checked' : ''}>
                <span class="calc-name">${h(ingredient.name)}</span>
                <span class="calc-ratio">${h(ingredientValueLabel(group.basis, ingredient))}</span>
                <span class="calc-gram" data-gram="${key}"></span>
              </label>
            </li>`;
            })
            .join('')}
        </ul>
        <p class="calc-subtotal">소계 <strong data-subtotal="${gi}"></strong></p>
      </div>`,
    )
    .join('');

  return `
    <section class="card detail-section calculator" data-total-count="${totalCount}">
      <h3 class="card-title">배합표 계산기</h3>
      ${inputs.length ? `<div class="calc-inputs">${inputs.join('')}</div>` : ''}
      ${inputs.length ? '<button type="button" class="btn btn-secondary calc-reset">기준 양으로 되돌리기</button>' : ''}
      ${groups}
      ${item.ingredientGroups.length > 1 ? '<p class="recipe-total">전체 합계 <strong data-total></strong></p>' : ''}
      <p class="calc-progress" aria-live="polite"></p>
    </section>`;
}

/** 계산기 동작을 붙인다. onAllChecked(완료 여부)로 "연습 시작" 버튼 강조를 바꾼다 */
export function bindCalculator(container, item, onAllChecked) {
  const section = container.querySelector('.calculator');
  if (!section) return;
  const state = stateFor(item);
  const totalCount = Number(section.dataset.totalCount);
  const flourInput = section.querySelector('[data-calc="flour"]');
  const piecesInput = section.querySelector('[data-calc="pieces"]');

  const setFieldError = (input, message) => {
    const field = input.closest('.field');
    const hint = field.querySelector('.field-hint');
    field.classList.toggle('is-invalid', Boolean(message));
    hint.textContent = message || hint.dataset.defaultHint;
  };

  const renderNumbers = () => {
    const flourOk = !flourInput || isValidFlour(state.flourGram);
    const piecesOk = !piecesInput || isValidPieces(state.pieces);
    const { groups, total } = calcGroups(item, state.flourGram, state.pieces);

    groups.forEach((group, gi) => {
      // 입력이 잘못되면 그 값을 쓰는 묶음만 "–"로 보여 준다
      const ok = group.basis === 'percent' ? flourOk : group.basis === 'perPiece' ? piecesOk : true;
      group.rows.forEach((row, ii) => {
        section.querySelector(`[data-gram="${gi}-${ii}"]`).textContent = ok ? `${formatNumber(row.gram)}g` : '–';
      });
      section.querySelector(`[data-subtotal="${gi}"]`).textContent = ok ? `${formatNumber(group.subtotal)}g` : '–';
      const basisLabel = section.querySelector(`[data-group-basis="${gi}"]`);
      basisLabel.textContent =
        group.basis === 'percent' ? '밀가루 기준 비율' : group.basis === 'perPiece' ? '개수 × 개당 무게' : '고정량';
    });

    const totalEl = section.querySelector('[data-total]');
    if (totalEl) totalEl.textContent = flourOk && piecesOk ? `${formatNumber(total)}g` : '–';
  };

  const renderProgress = () => {
    const done = state.checked.size;
    const all = done === totalCount;
    section.querySelector('.calc-progress').textContent = all
      ? `계량 ${done}/${totalCount} · 모두 계량했어요! 아래 '연습 시작'을 눌러요`
      : `계량 ${done}/${totalCount}`;
    section.querySelector('.calc-progress').classList.toggle('is-done', all);
    onAllChecked(all);
  };

  if (flourInput) {
    flourInput.addEventListener('input', () => {
      state.flourGram = Number(flourInput.value);
      const bad = flourInput.value === '' || !isValidFlour(state.flourGram);
      setFieldError(flourInput, bad ? `밀가루 무게는 ${formatNumber(FLOUR_RANGE.min)}~${formatNumber(FLOUR_RANGE.max)}g 사이로 입력해 주세요.` : '');
      renderNumbers();
    });
  }
  if (piecesInput) {
    piecesInput.addEventListener('input', () => {
      state.pieces = Number(piecesInput.value);
      const bad = piecesInput.value === '' || !isValidPieces(state.pieces);
      setFieldError(piecesInput, bad ? `개수는 ${PIECES_RANGE.min}~${PIECES_RANGE.max}개 사이의 정수로 입력해 주세요.` : '');
      renderNumbers();
    });
  }

  const resetBtn = section.querySelector('.calc-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.flourGram = item.baseFlourGram;
      state.pieces = item.basePieces;
      if (flourInput) {
        flourInput.value = item.baseFlourGram;
        setFieldError(flourInput, '');
      }
      if (piecesInput) {
        piecesInput.value = item.basePieces;
        setFieldError(piecesInput, '');
      }
      renderNumbers();
    });
  }

  section.querySelectorAll('[data-check]').forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) {
        state.checked.add(box.dataset.check);
      } else {
        state.checked.delete(box.dataset.check);
      }
      box.closest('.calc-row').classList.toggle('is-checked', box.checked);
      renderProgress();
    });
  });

  renderNumbers();
  renderProgress();
}

/** 품목을 고치거나 지웠을 때 계산기 값과 계량 체크를 비운다 */
export function resetCalcState(itemId) {
  calcState.delete(itemId);
}
