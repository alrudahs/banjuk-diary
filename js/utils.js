// 여러 화면에서 같이 쓰는 작은 함수

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 화면에 넣을 글자를 안전하게 바꾼다. 사용자가 입력한 글자는 꼭 이 함수를 거쳐 HTML에 넣는다 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** 160 → "2시간 40분", 15 → "15분" */
export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  return h ? `${h}시간` : `${m}분`;
}

/** 1836 → "1,836" */
export function formatNumber(value) {
  return Number(value).toLocaleString('ko-KR');
}

/**
 * 확인 창. 브라우저 기본 confirm 대신 앱 디자인에 맞춘 창을 띄운다.
 * 확인을 누르면 true, 취소·뒤로 가기·Esc면 false로 끝나는 Promise를 돌려준다.
 */
export function confirmDialog({ title, message, confirmLabel = '확인', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <h2 class="dialog-title">${escapeHtml(title)}</h2>
      ${message ? `<p class="dialog-message">${escapeHtml(message)}</p>` : ''}
      <div class="btn-group">
        <button type="button" class="btn btn-secondary" value="cancel">취소</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${escapeHtml(confirmLabel)}</button>
      </div>`;

    const finish = (ok) => {
      dialog.close();
      dialog.remove();
      resolve(ok);
    };
    dialog.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) finish(button.value === 'ok');
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}

/** 기기 시간대 기준 "2026-10-30" */
export function toDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-10-30" → "2026년 10월 30일" */
export function formatDate(dateString) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  return y ? `${y}년 ${m}월 ${d}일` : '';
}

/** "2026-10-30" → "10.30" */
export function formatShortDate(dateString) {
  const [, m, d] = String(dateString).split('-').map(Number);
  return m ? `${m}.${d}` : '';
}

/** 빈 화면 안내 (images/empty.svg 그림 + 제목 + 설명 + 버튼). title·text는 이미 안전한 HTML이어야 한다 */
export function emptyStateHtml({ title, text = '', action = '' }) {
  return `
    <div class="card empty-state">
      <img class="empty-illust" src="images/empty.svg" alt="" width="160" height="120">
      <p class="empty-title">${title}</p>
      ${text ? `<p class="card-text">${text}</p>` : ''}
      ${action}
    </div>`;
}
