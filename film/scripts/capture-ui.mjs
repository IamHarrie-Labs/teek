// Takes the real product screenshots used in the film's montage, straight from the live site.
// It starts Edge headless, waits until each page shows real devnet data, then saves a PNG to public/.
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SITE = process.env.TEEK_SITE ?? 'https://teek-navy.vercel.app';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const OUT = path.resolve('public');

const shots = [
  { name: 'ui-settled', url: '/launch.html?launch=HDUBMWwZcx6y7serfAiEXoxdd9iFG5CZF3aEt7u258LY', ready: 'Claims completed', scrollTo: '#detail' },
  { name: 'ui-record', url: '/launch.html?launch=HDUBMWwZcx6y7serfAiEXoxdd9iFG5CZF3aEt7u258LY', ready: 'Claims completed', scrollTo: '#passport' },
  { name: 'ui-refund', url: '/launch.html?launch=GEcqerbwSoV1CxgKiUFBLJbjqHWmgH29yzZLgguSR88z', ready: 'All refunds paid', scrollTo: '#passport' },
  { name: 'ui-list', url: '/launch.html', ready: 'All refunds paid', scrollTo: '#list' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'teek-capture-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); }
  }
  throw Error('Edge did not start');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; waiting.set(n, (m) => m.error ? reject(Error(m.error.message)) : resolve(m.result)); ws.send(JSON.stringify({ id: n, method, params })); });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, close: () => ws.close() }); });
}

try {
  const t = await target();
  const cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  for (const shot of shots) {
    await cdp.send('Page.navigate', { url: SITE + shot.url });
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { await sleep(500); ok = await evaluate(`document.body.innerText.includes(${JSON.stringify(shot.ready)})`); }
    if (!ok) { console.error(`${shot.name}: page never showed "${shot.ready}"`); continue; }
    if (shot.click) await evaluate(`[...document.querySelectorAll('button,a')].find(b=>b.textContent.includes(${JSON.stringify(shot.click)}))?.click()`);
    if (shot.scrollTo) await evaluate(`document.querySelector(${JSON.stringify(shot.scrollTo)})?.scrollIntoView({block:'start'}); window.scrollBy(0,-40)`);
    await sleep(1200);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(OUT, `${shot.name}.png`), Buffer.from(data, 'base64'));
    console.log(`saved ${shot.name}.png`);
  }
  cdp.close();
} finally {
  edge.kill();
}
