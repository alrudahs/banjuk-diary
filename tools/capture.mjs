// 진행 상황 캡처 도구 (개발용, 앱과 연결 안 됨)
// 사용법: node tools/capture.mjs <주소> <저장할 파일> [--pc] [--full] [--wait=밀리초] [--eval=코드]
//   --pc    PC 화면(1280×800)으로 찍는다. 없으면 휴대폰(390×844)
//   --full  화면 아래까지 길게 찍는다
//   --size=가로x세로[@배율]  원하는 화면 크기로 찍는다 (예: --size=768x1024, --size=320x640@2)
//   --eval  페이지가 열린 뒤 이 코드를 실행하고(await 가능) 찍는다. 버튼 누르기, 시험용 데이터 넣기 등에 쓴다
//   --eval-file=파일  코드를 파일에서 읽는다 (여러 번 쓸 수 있음)
//   저장할 파일을 - 로 주면 찍지 않고 코드 실행·콘솔 확인만 한다
// 페이지의 console.log, 오류는 터미널에 그대로 보여 준다.
// 브라우저 프로필은 매번 새로 만들고 지우므로, --eval로 넣은 데이터는 내 브라우저에 남지 않는다.
// 예: node tools/capture.mjs "http://localhost:8000/#items" captures/01-2-items.png
//
// 설치 없이 쓰려고 Edge(또는 Chrome)를 화면 없이 띄우고 개발자 도구 기능으로 찍는다.
// 브라우저 창 최소 폭 때문에 --window-size로는 휴대폰 폭을 정확히 맞출 수 없어서 이 방식을 쓴다.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const [url, outFile] = args.filter((a) => !a.startsWith('--'));
const isPc = args.includes('--pc');
const sizeArg = args.find((a) => a.startsWith('--size='));
const isFull = args.includes('--full');
const waitArg = args.find((a) => a.startsWith('--wait='));
const waitMs = waitArg ? Number(waitArg.split('=')[1]) : 800;
const evalArg = args.find((a) => a.startsWith('--eval='));
const evalFileArgs = args.filter((a) => a.startsWith('--eval-file='));
// --eval-file은 여러 번 줄 수 있고, 적은 순서대로 이어 붙인 뒤 --eval 코드를 실행한다 (공통 함수 파일 + 시험 파일)
const evalCode =
  [...evalFileArgs.map((a) => readFileSync(a.slice('--eval-file='.length), 'utf8')), evalArg ? evalArg.slice('--eval='.length) : '']
    .join('\n')
    .trim() || null;

if (!url || !outFile) {
  console.error('사용법: node tools/capture.mjs <주소> <저장할 파일> [--pc] [--full] [--wait=밀리초]');
  process.exit(1);
}

const BROWSERS = [
  process.env.CAPTURE_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) {
  console.error('Edge나 Chrome을 찾지 못했어요. CAPTURE_BROWSER 환경 변수에 경로를 넣어 주세요.');
  process.exit(1);
}

let screen = isPc
  ? { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
  : { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
if (sizeArg) {
  // --size=가로x세로[@배율]  예: --size=768x1024, --size=512x512@1
  const [, w, hgt, scale] = sizeArg.match(/=(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?/) || [];
  screen = { width: Number(w), height: Number(hgt), deviceScaleFactor: Number(scale || 1), mobile: Number(w) < 900 };
}

const profileDir = await mkdtemp(join(tmpdir(), 'banjuk-capture-'));
const browser = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  'about:blank',
]);

try {
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('브라우저가 10초 안에 열리지 않았어요.')), 10000);
    browser.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    browser.on('exit', () => reject(new Error('브라우저가 바로 종료됐어요.')));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('브라우저에 연결하지 못했어요.'));
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);

  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', screen);

  // 페이지의 콘솔 출력과 오류를 터미널에 보여 준다
  const showValue = (arg) => (arg.value !== undefined ? arg.value : arg.description ?? arg.type);
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log(`[페이지 ${msg.params.type}] ${msg.params.args.map(showValue).join(' ')}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log(`[페이지 오류] ${d.exception?.description || d.text}`);
      process.exitCode = 1;
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon\.ico$/.test(msg.params.entry.url || '')) {
      console.log(`[페이지 오류] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  });
  await page('Log.enable');

  const loaded = new Promise((resolve) => {
    listeners.push((msg) => {
      if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') resolve();
    });
  });
  const nav = await page('Page.navigate', { url });
  if (nav.errorText) throw new Error(`페이지를 열지 못했어요: ${nav.errorText} (서버가 켜져 있나요?)`);
  await loaded;
  await new Promise((r) => setTimeout(r, waitMs)); // 데이터 불러오기, 화면 그리기를 기다린다

  if (evalCode) {
    const result = await page('Runtime.evaluate', {
      expression: `(async () => { ${evalCode} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      console.log(`[--eval 오류] ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
      process.exitCode = 1;
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (outFile === '-') {
    ws.close();
  } else {
    if (isFull) {
      const { cssContentSize } = await page('Page.getLayoutMetrics');
      await page('Emulation.setDeviceMetricsOverride', {
        ...screen,
        height: Math.max(screen.height, Math.ceil(cssContentSize.height)),
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, Buffer.from(data, 'base64'));
    console.log(`저장: ${outFile}`);
    ws.close();
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  browser.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
