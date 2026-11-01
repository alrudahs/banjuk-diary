// 기본 품목 데이터 검사 도구 (개발용, 앱과 연결 안 됨)
// 사용법: node tools/check-items.mjs [파일]   (기본: data/items.json)
// prd.md 7.1 품목 구조와 5.3 입력 규칙을 기준으로 검사한다.
//   ❌ 오류: 앱이 잘못 동작할 수 있는 문제 (꼭 고쳐야 함)
//   ⚠️ 경고: 값이 이상해 보이는 곳 (확인 필요)
//   ℹ️ 참고: 아직 준비 안 된 파일 등

import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2] || 'data/items.json';

const ALLOWED_FIELDS = [
  'id', 'type', 'source', 'category', 'name', 'examMinutes', 'method', 'thumbnail', 'video',
  'photoCredit', 'requirements', 'notes', 'criteria', 'memo', 'baseFlourGram', 'basePieces',
  'ingredientGroups', 'steps', 'copiedFrom', 'createdAt', 'updatedAt',
];
const VALUE_FIELD = { percent: 'percent', perPiece: 'gramPerPiece', fixed: 'gram' };
const STEP_FIELDS = ['name', 'minutes', 'desc', 'tip', 'parallel'];
const FLOUR = /(강력분|중력분|박력분|밀가루|통밀가루|호밀가루|쌀가루)$/;

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

let items;
try {
  items = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`❌ ${file}을 읽지 못했어요: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(items)) {
  console.error('❌ items.json은 품목 목록(배열)이어야 해요.');
  process.exit(1);
}

const counts = { error: 0, warn: 0, info: 0 };
const seenIds = new Set();

items.forEach((item, index) => {
  const label = `${item.id || `#${index + 1}`} ${item.name || '(이름 없음)'}`;
  const found = [];
  const error = (msg) => found.push(['❌', msg]);
  const warn = (msg) => found.push(['⚠️', msg]);
  const info = (msg) => found.push(['ℹ️', msg]);

  // 기본 정보
  if (!isText(item.id)) error('id가 비어 있어요');
  else if (seenIds.has(item.id)) error(`id "${item.id}"가 다른 품목과 겹쳐요`);
  else seenIds.add(item.id);
  if (isText(item.id) && !/^(bread|pastry|etc)-\d{2}$/.test(item.id)) warn(`기본 품목 id는 bread-01, pastry-01 형식을 권장해요 (지금: ${item.id})`);

  if (!['실기', '일반'].includes(item.type)) error(`type은 "실기" 또는 "일반"이어야 해요 (지금: ${JSON.stringify(item.type)})`);
  if (item.source !== '기본') error(`items.json 품목의 source는 "기본"이어야 해요 (지금: ${JSON.stringify(item.source)})`);
  if (!['제과', '제빵'].includes(item.category)) error(`category는 "제과" 또는 "제빵"이어야 해요 (지금: ${JSON.stringify(item.category)})`);
  if (isText(item.id) && item.category === '제과' && item.id.startsWith('bread')) warn('제과 품목인데 id가 bread-로 시작해요');
  if (isText(item.id) && item.category === '제빵' && item.id.startsWith('pastry')) warn('제빵 품목인데 id가 pastry-로 시작해요');

  if (!isText(item.name)) error('name(품목 이름)이 비어 있어요');
  else if (item.name.length > 30) warn(`이름이 30자를 넘어요 (${item.name.length}자)`);

  if (item.type === '실기') {
    if (!Number.isInteger(item.examMinutes) || item.examMinutes <= 0) error('실기 품목은 examMinutes(시험 시간, 분)가 꼭 있어야 해요');
  } else if (item.examMinutes !== null && !(Number.isInteger(item.examMinutes) && item.examMinutes > 0)) {
    error('일반 품목의 examMinutes는 목표 시간(분) 또는 null이어야 해요');
  }
  if (item.examMinutes > 300) warn(`시험(목표) 시간이 ${item.examMinutes}분으로 꽤 길어요`);

  if (item.method !== undefined && typeof item.method !== 'string') error('method는 글자여야 해요');
  if (item.type === '실기' && !isText(item.method)) warn('실기 품목인데 method(반죽법)가 비어 있어요');

  for (const key of ['requirements', 'notes', 'criteria']) {
    if (item[key] !== undefined && !isStringArray(item[key])) error(`${key}는 글자 목록이어야 해요`);
    else if (Array.isArray(item[key]) && item[key].some((s) => !isText(s))) warn(`${key}에 빈 칸이 있어요`);
  }
  if (item.type === '실기' && (!Array.isArray(item.requirements) || item.requirements.length === 0)) warn('실기 품목인데 요구 사항이 비어 있어요');

  if (typeof item.memo === 'string' && item.memo.length > 500) error(`memo가 500자를 넘어요 (${item.memo.length}자)`);

  // 사진·영상
  if (item.thumbnail != null && typeof item.thumbnail !== 'string') error('thumbnail은 파일 경로여야 해요');
  else if (isText(item.thumbnail) && !existsSync(item.thumbnail)) info(`대표 사진 파일이 아직 없어요 (${item.thumbnail}) → 4단계 전까지 넣으면 돼요`);
  if (item.photoCredit != null) {
    const c = item.photoCredit;
    const missing = ['author', 'license', 'licenseUrl', 'source'].filter((k) => !isText(c[k]));
    if (missing.length) error(`photoCredit(사진 출처)에 빠진 항목이 있어요: ${missing.join(', ')}`);
  }
  if (item.video !== null && item.video !== undefined) {
    if (typeof item.video !== 'string') error('video는 파일 경로 또는 null이어야 해요');
    else if (!existsSync(item.video)) warn(`영상 파일이 없어요 (${item.video})`);
  }

  // 재료 묶음
  const groups = item.ingredientGroups;
  if (!Array.isArray(groups) || groups.length === 0) {
    error('ingredientGroups(재료 묶음)가 하나도 없어요');
  } else {
    groups.forEach((g, gi) => {
      const gl = `묶음 "${g.name || gi + 1}"`;
      if (!isText(g.name)) error(`${gi + 1}번째 묶음의 이름이 비어 있어요`);
      if (!VALUE_FIELD[g.basis]) {
        error(`${gl}의 basis는 percent, perPiece, fixed 중 하나여야 해요 (지금: ${JSON.stringify(g.basis)})`);
        return;
      }
      const field = VALUE_FIELD[g.basis];
      if (!Array.isArray(g.ingredients) || g.ingredients.length === 0) {
        error(`${gl}에 재료가 없어요`);
        return;
      }
      const names = new Set();
      g.ingredients.forEach((ing, ii) => {
        const il = `${gl}의 ${ii + 1}번째 재료 "${ing.name || ''}"`;
        if (!isText(ing.name)) error(`${gl}의 ${ii + 1}번째 재료 이름이 비어 있어요`);
        else if (names.has(ing.name)) warn(`${gl}에 "${ing.name}"이 두 번 있어요`);
        else names.add(ing.name);
        if (!isPositive(ing[field])) error(`${il}: basis가 ${g.basis}이면 ${field} 값(0보다 큰 숫자)이 있어야 해요`);
        for (const other of Object.values(VALUE_FIELD)) {
          if (other !== field && other in ing) error(`${il}: ${g.basis} 묶음에는 ${other}가 아니라 ${field}를 써요`);
        }
        if (g.basis === 'percent' && ing.percent > 150) warn(`${il}: 비율 ${ing.percent}%가 너무 커 보여요`);
        if (g.basis === 'perPiece' && ing.gramPerPiece > 200) warn(`${il}: 개당 ${ing.gramPerPiece}g이 너무 커 보여요`);
      });

      if (g.basis === 'percent') {
        const flour = g.ingredients.filter((i) => FLOUR.test(i.name || ''));
        const flourSum = flour.reduce((s, i) => s + (i.percent || 0), 0);
        const total = g.ingredients.reduce((s, i) => s + (i.percent || 0), 0);
        if (flour.length === 0) warn(`${gl}에 밀가루(○○분)가 없어요. 비율의 기준(100%)이 무엇인지 확인해 주세요`);
        else if (Math.abs(flourSum - 100) > 0.01) warn(`${gl}의 밀가루 비율 합이 ${flourSum}%예요. 보통 100%예요`);
        if (total < 120 || total > 450) warn(`${gl}의 비율 합계가 ${total}%로 이상해 보여요`);
        if (item.category === '제빵' && !g.ingredients.some((i) => /이스트/.test(i.name || ''))) warn(`${gl}: 제빵 반죽인데 이스트가 없어요`);
        if (!g.ingredients.some((i) => /소금/.test(i.name || ''))) warn(`${gl}: 소금이 없어요`);
      }
    });

    const hasPercent = groups.some((g) => g.basis === 'percent');
    const hasPerPiece = groups.some((g) => g.basis === 'perPiece');
    if (hasPercent) {
      if (!Number.isFinite(item.baseFlourGram)) error('percent 묶음이 있으면 baseFlourGram(기준 밀가루 무게)이 있어야 해요');
      else if (item.baseFlourGram < 100 || item.baseFlourGram > 3000) error(`baseFlourGram ${item.baseFlourGram}g이 입력 범위(100~3,000g)를 벗어나요`);
    } else if (item.baseFlourGram != null) {
      warn('percent 묶음이 없는데 baseFlourGram이 있어요 (쓰이지 않아요)');
    }
    if (hasPerPiece) {
      if (!Number.isInteger(item.basePieces)) error('perPiece 묶음이 있으면 basePieces(기준 개수, 정수)가 있어야 해요');
      else if (item.basePieces < 1 || item.basePieces > 100) error(`basePieces ${item.basePieces}개가 입력 범위(1~100개)를 벗어나요`);
    } else if (item.basePieces != null) {
      warn('perPiece 묶음이 없는데 basePieces가 있어요 (쓰이지 않아요)');
    }

    // 계량 시간 참고 검사: 공개문제는 보통 반죽 재료 1개당 1분
    const req = Array.isArray(item.requirements) ? item.requirements.join(' ') : '';
    const m = req.match(/진열[^()]*\((\d+)분\)/);
    const firstPercent = groups.find((g) => g.basis === 'percent');
    if (m && firstPercent && Array.isArray(firstPercent.ingredients) && Number(m[1]) !== firstPercent.ingredients.length) {
      warn(`계량 시간 ${m[1]}분과 반죽 재료 수 ${firstPercent.ingredients.length}개가 달라요 (보통 재료 1개당 1분)`);
    }
  }

  // 공정 단계
  const steps = item.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    error('steps(만드는 순서)가 하나도 없어요');
  } else {
    steps.forEach((s, si) => {
      const sl = `${si + 1}번째 단계 "${s.name || ''}"`;
      if (!isText(s.name)) error(`${si + 1}번째 단계 이름이 비어 있어요`);
      if (s.minutes !== null && !(Number.isInteger(s.minutes) && s.minutes > 0)) error(`${sl}: minutes는 분(1 이상 정수) 또는 null(스톱워치)이어야 해요`);
      for (const key of ['desc', 'tip', 'parallel']) {
        if (s[key] !== undefined && typeof s[key] !== 'string') error(`${sl}: ${key}는 글자여야 해요`);
      }
      const extra = Object.keys(s).filter((k) => !STEP_FIELDS.includes(k));
      if (extra.length) warn(`${sl}: 모르는 항목이 있어요 (${extra.join(', ')})`);
    });
    const timed = steps.reduce((sum, s) => sum + (Number.isInteger(s.minutes) ? s.minutes : 0), 0);
    if (Number.isInteger(item.examMinutes) && timed >= item.examMinutes) {
      warn(`시간이 정해진 단계만 더해도 ${timed}분이라 시험(목표) 시간 ${item.examMinutes}분을 넘어요`);
    }
  }

  const unknown = Object.keys(item).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (unknown.length) warn(`prd 7.1에 없는 항목이 있어요 (${unknown.join(', ')})`);

  // 출력
  const e = found.filter(([t]) => t === '❌').length;
  const w = found.filter(([t]) => t === '⚠️').length;
  counts.error += e;
  counts.warn += w;
  counts.info += found.length - e - w;
  console.log(`\n${e ? '❌' : w ? '⚠️' : '✅'} ${label}`);
  found.forEach(([t, msg]) => console.log(`   ${t} ${msg}`));
});

console.log(`\n품목 ${items.length}개 검사: 오류 ${counts.error}개, 경고 ${counts.warn}개, 참고 ${counts.info}개`);
process.exitCode = counts.error ? 1 : 0;
