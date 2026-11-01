# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 반죽일기

제과·제빵 기능사 실기 연습 노트 웹앱. 기획서는 `prd.md`(v1.1)이고, 이 파일은 작업할 때 지켜야 할 규칙만 요약한다. 자세한 내용은 항상 prd.md를 따른다.

## 프로젝트 한 줄 요약

"연습 → 기록 → 돌아보기 → 다시 연습" 흐름을 만드는 개인 연습 노트. **중심은 연습 기록**이고, 레시피는 연습을 돕는 참고 정보다. 실기 품목뿐 아니라 실기가 아닌 빵·과자도 개인 레시피 노트처럼 등록해 똑같이 연습·기록할 수 있다.

## 작업 원칙

- **한 번에 한 기능씩** 작업한다. 요청이 "prd F-07 기준으로"처럼 기능 ID로 오면 prd.md의 해당 부분(5.1 기능 목록, 5.3 입력 규칙, 6.2 화면, 7장 데이터·계산 규칙)을 먼저 읽고 그 범위만 구현한다.
- 요청하지 않은 기능을 미리 만들지 않는다. 다음 단계에 필요해 보이면 제안만 한다.
- prd.md와 다르게 만들어야 할 이유가 생기면 구현하기 전에 먼저 묻는다.
- 작업이 끝나면 **브라우저에서 확인하는 방법**을 짧게 알려 준다.
- 커밋은 사용자가 요청할 때만 한다.
- 사용자는 바이브코딩으로 개발한다. 설명은 쉬운 말로, 전문 용어는 한 번 풀어서 쓴다.

## 진행 캡처

- prd.md 9.3의 단계 하나가 끝날 때마다 바뀐 화면을 `captures/`에 찍어 둔다(발표 자료용).
- 찍는 방법: 로컬 서버를 켠 상태에서 `node tools/capture.mjs "<주소>" captures/<파일>.png` (`--pc` PC 화면, `--full` 전체 길이).
- 파일 이름: `단계 두 자리-번호-내용.png` (예: `03-2-items.png`, `10-2-pc.png`).
- 찍은 뒤 `captures/progress.md` 표에 날짜·단계·파일·내용을 한 줄씩 추가한다. 화면이 바뀌지 않은 단계(데이터 파일만 만든 경우 등)는 "화면 변화 없음"으로 적는다.
- 찍은 이미지를 직접 열어 보고, 화면이 깨졌으면 사용자에게 알린다.

## 기술 스택

- HTML, CSS, 순수 JavaScript. 프레임워크, 빌드 도구, npm 패키지를 쓰지 않는다. 외부 라이브러리가 꼭 필요하면 먼저 묻는다.
- JS는 ES 모듈(`<script type="module">`)로 파일을 나눈다.
- 서버, 로그인, 서버 데이터베이스 없음. 데이터는 JSON 파일과 브라우저 저장소(IndexedDB, localStorage)에만 둔다.
- 하단 탭(홈·품목·기록·설정)이 있는 모바일 우선 한 페이지 앱.
- 배포: GitHub Pages. 모든 경로는 상대 경로로 쓴다.
- 로컬 확인: `fetch`로 JSON을 읽기 때문에 `index.html`을 더블클릭(file://)하면 동작하지 않는다. VS Code Live Server나 `python -m http.server 8000` 같은 로컬 서버로 연다.

## 명령어

빌드·린트·자동 테스트는 없다. 개발용 도구는 Node 내장 모듈만 쓰므로 `npm install`이 필요 없다.

- 로컬 서버: `python -m http.server 8000` → `http://localhost:8000/`
- 품목 데이터 검사: `node tools/check-items.mjs` (items.json을 고친 뒤 꼭 실행. ❌ 오류는 반드시 고친다)
- 화면 확인·캡처: `node tools/capture.mjs "<주소>" <파일|->` — Edge/Chrome을 화면 없이 띄워 찍는다.
  - `--eval="코드"` / `--eval-file=파일`: 페이지가 열린 뒤 코드를 실행(버튼 누르기, 시험 데이터 넣기). 페이지 console 출력과 오류가 터미널에 나온다.
  - 저장 파일을 `-`로 주면 찍지 않고 코드 실행·콘솔 확인만 한다 → 기능이 동작하는지 확인할 때 쓴다.
  - `--size=768x1024`(태블릿 확인), `--wait=밀리초`. 브라우저 프로필은 매번 새로 만들어 지우므로 내 데이터에 남지 않는다.
- 수동 테스트 목록: `docs/test-checklist.md` (기능 ID별 확인 방법·기대 결과. 기능을 고치면 해당 줄을 다시 확인한다)

## 구조 (여러 파일을 봐야 알 수 있는 것)

- **화면 전환은 주소 해시(#)로 한다.** `app.js`의 `render()`가 `hashchange`마다 해시를 읽어 `index.html`의 `.screen` 하나만 보이게 하고 해당 모듈의 `show...()`를 부른다. 경로 목록은 `app.js` 맨 위 주석에 있다(`#items/<id>`, `#items/edit/<id>`, `#practice`, `#records/new` 등). 새 화면도 이 방식으로 붙이고, 화면 사이 이동은 `location.hash`를 바꿔서 한다.
- `#practice`에서는 하단 탭을 숨기고(`body.is-practicing`), 연습 중에 다른 화면으로 가면 돌아가기 띠(`#practice-banner`)를 보여 준다. 진행 중인 연습은 `timer.js`의 `getActiveSession()`으로 확인한다.
- IndexedDB는 `db.js`만 직접 다룬다(`DB_VERSION`을 올리면 `onupgradeneeded`에서 저장소·인덱스를 만든다). 설정은 `settings.js`가 localStorage 한 키에 객체로 저장한다.
- 화면 HTML은 템플릿 문자열로 만든다. 사용자가 입력한 글자는 반드시 `escapeHtml`(보통 `h`로 import)을 거친다. 확인 창은 브라우저 `confirm()` 대신 `confirmDialog()`(utils.js)를 쓴다.
- 새 JS·CSS·데이터 파일을 추가하면 `sw.js`의 `CORE`에 넣고 `CACHE` 숫자를 올린다.
- `settings.js`의 `SHOW_SAMPLE_BUTTON`: 발표용 샘플 데이터 버튼(id가 `sample-`로 시작). 발표가 끝나면 `false`로 바꾼다.

## 폴더 구조

```
banjuk-diary/
├─ CLAUDE.md
├─ prd.md
├─ index.html
├─ manifest.webmanifest  홈 화면에 추가할 때의 앱 이름·아이콘 (PWA)
├─ sw.js              서비스 워커: 인터넷이 없어도 열리게 (CORE 목록을 바꾸면 CACHE 숫자를 올린다)
├─ style-guide.html   공통 스타일 견본 (개발용, 앱과 연결 안 됨)
├─ tools/capture.mjs  진행 캡처 도구 (개발용)
├─ tools/check-items.mjs  items.json 검사 도구 (개발용, items.json을 고친 뒤 실행)
├─ captures/          단계별 진행 캡처와 progress.md
├─ docs/test-checklist.md  기능별 수동 테스트 목록
├─ css/style.css
├─ js/
│  ├─ app.js          화면 전환, 하단 탭, 시작
│  ├─ db.js           IndexedDB(items, records) 접근은 모두 여기서
│  ├─ utils.js        글자 안전하게 넣기(escapeHtml), 시간·숫자 표시
│  ├─ items.js        기본 품목 + 내 품목 합치기, 목록·상세
│  ├─ item-editor.js  내 품목 추가·수정·복사
│  ├─ calculator.js   배합 계산, 계량 체크
│  ├─ timer.js        연습 모드 타이머
│  ├─ records.js      기록 작성·갤러리·수정·삭제
│  ├─ stats.js        평균 점수, 연습 횟수, 약한 품목, D-day
│  ├─ home.js         홈 대시보드, 약한 품목 분석 화면
│  ├─ settings.js     시험일, 백업 내보내기·불러오기, 초기화
│  └─ image.js        사진 줄이기(긴 변 1200px)
├─ data/  (items.json, troubles.json)
├─ images/  (items, icons, logo/icon.svg·icon-192·512·180.png, empty.svg, credits.md)
└─ videos/
```

## 이름 규칙

- 파일·폴더 이름은 **모두 소문자**, 단어 사이는 하이픈(`item-editor.js`). GitHub Pages가 대소문자를 구분하기 때문이다. **CLAUDE.md만 예외**.
- JS 변수·함수와 JSON 필드는 camelCase. JSON 필드 이름은 prd.md 7장과 똑같이 쓴다.
- 화면 문구는 한국어 해요체("아직 기록이 없어요").

## 디자인

따뜻한 베이커리 느낌: 크림색 배경, 갈색(구운 빵 색) 포인트, 둥근 모서리. 색·글자 크기·여백·모서리는 `css/style.css`의 `:root` 변수로만 쓴다.

```css
:root {
  --color-bg: #FFF8EC;        /* 크림색 배경 */
  --color-surface: #FFFFFF;   /* 카드 */
  --color-primary: #8B5A2B;   /* 구운 빵 갈색 (포인트, 주요 버튼) */
  --color-primary-dark: #6B4220;
  --color-accent: #D9A066;    /* 크러스트 황금색 (배지, 강조) */
  --color-text: #3B2A1E;
  --color-muted: #8A7A6A;
  --color-danger: #C0392B;    /* 시간 초과, 삭제 */
  --radius: 16px;
}
```

- 위는 핵심 색만 적은 것이고, 전체 변수(글자 크기, 여백, 모서리, 버튼 높이)는 `css/style.css` 맨 위에 있다.
- 새 화면은 공통 클래스(`.btn`, `.card`, `.field`/`.input`, `.badge`)를 먼저 쓰고, 모양은 `style-guide.html`에서 확인한다.
- 버튼은 손에 밀가루가 묻어도 누르기 쉽게 크게(높이 48px 이상, 기본 52px).
- 연습 모드 타이머 숫자는 멀리서도 읽히게 아주 크게.
- 휴대폰 세로 화면이 기준이고, 600px 이상(태블릿)은 목록 두 줄, 960px 이상(PC)은 가운데 정렬 2단 배치(품목 상세·홈). 입력·연습 화면은 PC에서도 640px로 좁게.
- 빈 화면은 `emptyStateHtml()`(utils.js)로 `images/empty.svg`와 안내를 보여 준다.

## 데이터 핵심 규칙 (자세한 것은 prd.md 7장)

| 데이터 | 저장 위치 |
| --- | --- |
| 기본 품목 | `data/items.json` (앱에서 수정·삭제 불가) |
| 내 품목 | IndexedDB `items` |
| 실패 원인 사전 | `data/troubles.json` |
| 연습 기록 | IndexedDB `records` |
| 설정(시험일 등) | localStorage |

**품목**

- `type`: `"실기"`(시험 시간·요구 사항 있음) | `"일반"`(실기가 아닌 빵·과자).
- `source`: `"기본"`(items.json) | `"내 품목"`(IndexedDB). 목록에는 두 출처를 합쳐서 보여 준다.
- 기본 품목은 수정·삭제 버튼 대신 "복사해서 내 품목으로 만들기"만 있다. 복사본은 새 id(`my-` + 시각)와 `copiedFrom`을 갖는다.
- `examMinutes`: 실기는 시험 시간(필수), 일반은 목표 시간(없으면 `null`).
- `ingredientGroups`: 재료 묶음(반죽·토핑·충전물 등). 묶음마다 `basis`가 있다.
  - `"percent"` → 재료 값 필드 `percent`, 밀가루 무게로 계산
  - `"perPiece"` → 재료 값 필드 `gramPerPiece`, 개수로 계산
  - `"fixed"` → 재료 값 필드 `gram`, 고정
- `steps`: `name`, `minutes`(없으면 `null` → 스톱워치 단계), `desc`(설명), `tip`(포인트), `parallel`(동시 진행 메모).
- **모든 품목에서 같은 기능**: 계산기, 연습 모드, 기록, 약한 품목 계산은 type·source로 분기하지 않는다. 다른 것은 배지, 시간 이름(시험 시간/목표 시간), 수정·복사 버튼, 영상 여부뿐이다.

**연습 기록**

- `entry`: `"practice"`(연습 모드를 끝내고 작성) | `"manual"`(기록 직접 추가, 걸린 시간은 직접 입력).
- `itemName`을 함께 저장한다. 내 품목을 삭제해도 기록은 남기고 이 이름으로 보여 준다.
- 사진은 `image.js`로 긴 변 1200px로 줄여 저장한다(최대 3장).

**백업(F-16)**: 내보내기 파일에 연습 기록과 내 품목을 함께 넣는다. 불러오기와 초기화 전에는 확인 창을 띄운다.

## 계산 규칙 (prd.md 7.3)

- percent: 밀가루 무게 × 비율 ÷ 100, perPiece: 개당 g × 개수, fixed: 그대로. 모두 1g 단위 반올림, 묶음 소계와 전체 합계 표시.
- 입력 범위: 밀가루 100~3,000g, 개수 1~100개. 해당 묶음이 없으면 입력칸을 숨긴다.
- 타이머: 시작 시각과 일시정지 기록을 저장해 매번 다시 계산한다(화면이 꺼졌다 켜져도 정확하게). `setInterval`로 숫자를 하나씩 빼는 방식은 쓰지 않는다.
- 시험(목표) 시간이 있으면 남은 시간 막대, 초과하면 빨간색. 없으면 경과 시간만.
- 기록 평균 점수 = 부피·모양·색·내상 평균.
- 약한 품목 = 기록 2회 이상인 품목 가운데 **최근 3회** 평균이 낮은 순 2개(동점이면 연습 횟수가 적은 품목 먼저, 삭제된 품목 제외). 계산은 `stats.js` 한곳에서 하고 홈과 분석 화면이 같이 쓴다.

## 하지 않는 것

- 회원가입·로그인, 서버, 다른 사람과 공유, 앱스토어 출시.
- 내 품목에 영상 올리기.
- 동시 공정 타이머(F-23)는 선택 기능이다. MVP에서는 `parallel` 메모만 보여 준다.
