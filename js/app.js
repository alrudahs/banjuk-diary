// 화면 전환과 하단 탭.
// 주소 끝의 해시로 화면을 정해서, 새로고침하거나 뒤로 가기를 눌러도 같은 화면이 보이게 한다.
//   #home, #items, #records, #settings  → 탭
//   #items/bread-01                      → 품목 상세
//   #items/new, #items/edit/<id>, #items/copy/<id> → 내 품목 추가·수정·복사
//   #practice                            → 연습 모드 (하단 탭을 숨긴다)
//   #records/new, #records/<id>, ...      → 기록 작성·상세·수정 (records.js 참고)
//   #analysis                            → 약한 품목 분석 (홈에서 들어간다)

import { initItems, showItems } from './items.js';
import { showPractice, hidePractice, getActiveSession } from './timer.js';
import { initRecords, showRecords } from './records.js';
import { showHome, showAnalysis } from './home.js';
import { showSettings } from './settings.js';
import { escapeHtml as h } from './utils.js';

const TABS = ['home', 'items', 'records', 'settings'];
const SCREENS = [...TABS, 'practice', 'analysis'];
// 탭이 아닌 화면에서 밝게 표시할 하단 탭
const PARENT_TAB = { analysis: 'home' };
const DEFAULT_TAB = 'home';

function parseRoute() {
  const [screen, ...params] = location.hash.slice(1).split('/');
  return {
    screen: SCREENS.includes(screen) ? screen : DEFAULT_TAB,
    params: params.map(decodeURIComponent),
  };
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.dataset.screen !== screen;
  });

  document.querySelectorAll('.tab').forEach((link) => {
    const active = link.dataset.tab === (PARENT_TAB[screen] || screen);
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  document.body.classList.toggle('is-practicing', screen === 'practice');
}

// 연습 중에 다른 화면으로 가면 돌아갈 수 있는 띠를 보여 준다
function updatePracticeBanner(screen) {
  const banner = document.getElementById('practice-banner');
  const active = getActiveSession();
  banner.hidden = !active || screen === 'practice';
  document.body.classList.toggle('has-practice-banner', !banner.hidden);
  if (active) banner.innerHTML = `<span>연습 중 · ${h(active.item.name)}</span><strong>돌아가기 →</strong>`;
}

function render() {
  const { screen, params } = parseRoute();
  // 다른 화면으로 가면 재생 중인 영상을 멈춘다 (숨겨진 화면에서 소리가 계속 나지 않게)
  document.querySelectorAll('video').forEach((video) => video.pause());
  showScreen(screen);

  if (screen === 'practice') {
    showPractice(document.getElementById('practice-view'));
  } else {
    hidePractice();
  }
  if (screen === 'home') showHome(document.getElementById('home-view'));
  if (screen === 'analysis') showAnalysis(document.getElementById('analysis-view'));
  if (screen === 'items') showItems(params);
  if (screen === 'records') showRecords(params);
  if (screen === 'settings') showSettings(document.getElementById('settings-view'));

  updatePracticeBanner(screen);
  window.scrollTo(0, 0);
}

initItems();
initRecords();
window.addEventListener('hashchange', render);
render();

// 홈 화면에 추가해 쓸 수 있게 서비스 워커를 등록한다 (지원하지 않는 브라우저는 그냥 넘어간다)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('서비스 워커를 등록하지 못했어요:', err));
}
