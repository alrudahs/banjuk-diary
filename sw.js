// 서비스 워커: 홈 화면에 추가한 앱이 인터넷이 없어도 열리게 한다. (PWA, 9.3의 10-4)
// 항상 인터넷에서 먼저 가져오고(그래서 고친 내용이 바로 보인다), 실패하면 저장해 둔 파일을 보여 준다.
// 앱에 꼭 필요한 파일 목록(CORE)을 바꾸면 CACHE 이름의 숫자를 올린다.

const CACHE = 'banjuk-v1';
const CORE = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/utils.js',
  'js/items.js',
  'js/item-editor.js',
  'js/calculator.js',
  'js/timer.js',
  'js/records.js',
  'js/stats.js',
  'js/home.js',
  'js/settings.js',
  'js/image.js',
  'data/items.json',
  'data/troubles.json',
  'images/items/default.svg',
  'images/empty.svg',
  'images/logo/icon.svg',
  'images/logo/icon-192.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // 다른 사이트 요청, 저장이 아닌 요청, 영상(부분 요청)은 그대로 보낸다
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }),
  );
});
