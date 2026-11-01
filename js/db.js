// IndexedDB 저장소. 다른 파일은 IndexedDB를 직접 쓰지 않고 이 파일의 함수만 쓴다. (prd 7장)
//   items   : 내 품목 (기본 품목은 data/items.json에 있다)
//   records : 연습 기록
// 모든 함수는 Promise를 돌려준다. 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)에서는 실패하므로,
// 부르는 쪽에서 try/catch로 안내 문구를 보여 준다.

const DB_NAME = 'banjuk-diary';
const DB_VERSION = 1;

export const STORES = {
  items: 'items',
  records: 'records',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 기기 저장소(IndexedDB)를 지원하지 않아요.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // 처음 열 때(또는 DB_VERSION을 올렸을 때) 저장소를 만든다
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.items)) {
        db.createObjectStore(STORES.items, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.records)) {
        const records = db.createObjectStore(STORES.records, { keyPath: 'id' });
        records.createIndex('itemId', 'itemId');
        records.createIndex('date', 'date');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 탭에서 반죽일기를 닫고 다시 열어 주세요.'));
  });

  // 실패했으면 다음에 다시 시도할 수 있게 비워 둔다
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function run(storeName, mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('저장이 취소됐어요. 기기 저장 공간을 확인해 주세요.'));
      }),
  );
}

/** 저장소의 모든 값을 불러온다 */
export function getAll(storeName) {
  return run(storeName, 'readonly', (store) => store.getAll());
}

/** id로 값 하나를 불러온다. 없으면 undefined */
export function getById(storeName, id) {
  return run(storeName, 'readonly', (store) => store.get(id));
}

/** 값을 저장한다. 같은 id가 있으면 덮어쓴다 */
export function save(storeName, value) {
  return run(storeName, 'readwrite', (store) => store.put(value));
}

/** id로 값 하나를 삭제한다 */
export function remove(storeName, id) {
  return run(storeName, 'readwrite', (store) => store.delete(id));
}

/** 저장소를 모두 비운다 (설정의 데이터 초기화용) */
export function clear(storeName) {
  return run(storeName, 'readwrite', (store) => store.clear());
}
