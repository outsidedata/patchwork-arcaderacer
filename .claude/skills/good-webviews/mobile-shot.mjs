// Mobile screenshot via CDP device-metrics emulation. Opens a throwaway tab,
// emulates a real phone viewport, navigates, full-page captures, closes the tab.
// Run: node --experimental-websocket /tmp/mshot.mjs <url> <out.png> [w] [h] [settleMs]
import fs from 'fs';

const PORT = process.env.WEBVIEW_PORT || 9222;
const url = process.argv[2];
const out = process.argv[3];
const W = +(process.argv[4] || 390);
const H = +(process.argv[5] || 844);
const settle = +(process.argv[6] || 2400);

async function httpJSON(path, method = 'GET') {
  const r = await fetch(`http://localhost:${PORT}${path}`, { method });
  return r.json();
}

let tab;
try { tab = await httpJSON(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT'); }
catch { tab = await httpJSON(`/json/new?${encodeURIComponent('about:blank')}`, 'GET'); }
if (!tab?.webSocketDebuggerUrl) { console.error('no tab', JSON.stringify(tab)); process.exit(1); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0; const cbs = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && cbs.has(m.id)) { cbs.get(m.id)(m.result); cbs.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; cbs.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
const vp = process.argv[7] === 'vp';
const scrollY = +(process.argv[8] || 0);
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, settle));
if (scrollY) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scrollY})` }); await new Promise((r) => setTimeout(r, 250)); }
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !vp });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
await fetch(`http://localhost:${PORT}/json/close/${tab.id}`).catch(() => {});
console.log('wrote', out, `${W}x${H}`);
process.exit(0);
