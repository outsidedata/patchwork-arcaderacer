// good-webviews — self-healing, multi-instance Chrome DevTools Protocol driver.
//
// Drives a REAL, VISIBLE Chrome over its remote-debugging port. No MCP, no
// puppeteer, no npm installs. Safe for MANY Claude Code instances at once:
// they share ONE Chrome, but each drives its OWN tab.
//
// Two hard-won facts this encodes:
//
//   1. Chrome SILENTLY REFUSES the debug port on the DEFAULT profile. The log
//      says: "DevTools remote debugging requires a non-default data directory."
//      The port never binds. => We ALWAYS launch with a dedicated --user-data-dir.
//
//   2. Concurrency. If two instances both see "not up" they both try to launch
//      on the same profile+port and the second dies on the profile SingletonLock.
//      => A launch LOCK: one instance launches, the rest just wait for the port.
//      And a per-tab REGISTRY so instances don't clobber each other's page.
//
// Run with the experimental WebSocket flag (Node 20 has no global WebSocket):
//   node --experimental-websocket webview.mjs <command> [args]
//
// Commands:
//   launch                     ensure a debug Chrome is up; print the endpoint
//   list                       list open page targets (type | title | url)
//   nav   <url>                navigate THIS instance's tab to url
//   shot  <out.png> [url] [ms] screenshot THIS instance's tab; nav first; wait ms (default 1500)
//   eval  <js>                 evaluate JS in THIS instance's tab, print result
//   close                      close THIS instance's tab and drop it from the registry
//   pin / unpin                exempt / re-expose THIS instance's tab from the idle reaper
//   acquire / release          take / drop the exclusive GPU test lease (one tester at a time)
//
// Lifecycle: every invocation refreshes THIS tab's lastUsed and sweeps any tab idle
// longer than the TTL (default 10 min). Idle tabs self-close; tabs you keep driving stay
// up. `pin` a tab you'll leave computing untouched so a long GPGPU run isn't reaped.
//
// Per-instance isolation (each agent drives its OWN tab, no fighting):
//   WEBVIEW_TAB      tab key — defaults to CLAUDE_CODE_SESSION_ID (unique per agent),
//                    falling back to 'default'. Override only to force tab sharing.
// Lifecycle / concurrency tuning:
//   WEBVIEW_TTL        idle-reap age in SECONDS (default 600; 0 disables reaping this run)
//   WEBVIEW_LEASE_TTL  seconds before a silent lease holder is presumed dead (default 120)
//   WEBVIEW_LEASE_WAIT seconds to block on `acquire` before giving up (default 300)
// Shared-browser overrides (keep equal across instances to share one Chrome):
//   WEBVIEW_PORT     debug port (default 9222)
//   WEBVIEW_PROFILE  dedicated user-data-dir (default ~/.chrome-cdp-profile)
//   WEBVIEW_CHROME   explicit Chrome binary path

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const PORT = process.env.WEBVIEW_PORT || '9222'
const PROFILE = process.env.WEBVIEW_PROFILE || path.join(os.homedir(), '.chrome-cdp-profile')
// Default to the per-agent session id so every Claude instance — main thread or subagent —
// drives its own tab. Two agents in the same project dir no longer stomp each other.
const TAB_KEY = process.env.WEBVIEW_TAB || process.env.CLAUDE_CODE_SESSION_ID || 'default'
// Identity used for the GPU lease: the agent, independent of how many tabs it keys.
const AGENT = process.env.CLAUDE_CODE_SESSION_ID || TAB_KEY
const TTL_MS = (process.env.WEBVIEW_TTL !== undefined ? Number(process.env.WEBVIEW_TTL) : 600) * 1000
const LEASE_TTL_MS = (Number(process.env.WEBVIEW_LEASE_TTL) || 120) * 1000
const LEASE_WAIT_MS = (Number(process.env.WEBVIEW_LEASE_WAIT) || 300) * 1000

const CHROME_CANDIDATES = [
  process.env.WEBVIEW_CHROME,
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function chromeBinary() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('No Chrome binary found. Set WEBVIEW_CHROME to its path.')
}

// --- cross-process lock: atomic mkdir, stale-breaking, with timeout ----------

async function withLock(name, fn, { timeoutMs = 30000, staleMs = 60000 } = {}) {
  fs.mkdirSync(PROFILE, { recursive: true })
  const dir = path.join(PROFILE, `${name}.lock`)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      fs.mkdirSync(dir) // atomic: succeeds for exactly one holder
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      // break a stale lock left by a crashed process
      try {
        const age = Date.now() - fs.statSync(dir).mtimeMs
        if (age > staleMs) { fs.rmSync(dir, { recursive: true, force: true }); continue }
      } catch {}
      if (Date.now() > deadline) throw new Error(`lock '${name}' timed out`)
      await sleep(150)
    }
  }
  try { return await fn() }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }
}

// --- endpoint discovery ------------------------------------------------------

async function browserWs() {
  // Chrome may bind DevTools to IPv4 or IPv6 loopback only (Chrome Dev 152 picks ::1) — probe both.
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const res = await fetch(`http://${host}:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) { const j = await res.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl }
    } catch {}
  }
  try {
    const lines = fs.readFileSync(path.join(PROFILE, 'DevToolsActivePort'), 'utf8').trim().split('\n')
    if (lines[1]) return `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}`
  } catch {}
  return null
}

async function ensureChrome() {
  const up = await browserWs()
  if (up) return up
  // Only one instance may launch; the rest fall through and poll the port.
  return await withLock('launch', async () => {
    const again = await browserWs()
    if (again) return again
    fs.mkdirSync(PROFILE, { recursive: true })
    const out = fs.openSync(path.join(PROFILE, 'chrome.log'), 'a')
    const child = spawn(chromeBinary(), [
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${PORT}`,
      '--remote-allow-origins=*', // ONE argv element — never let a shell glob it
      '--no-first-run',
      '--no-default-browser-check',
      // NEVER-STEAL-FOCUS (2026-07-04): keep rendering + rAF alive while occluded/backgrounded,
      // so capture never needs to raise the window over the user's work.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      'about:blank',
    ], { detached: true, stdio: ['ignore', out, out] })
    child.unref()
    for (let i = 0; i < 60; i++) {
      await sleep(500)
      const ws = await browserWs()
      if (ws) return ws
    }
    throw new Error('Chrome launched but debug port never came up — see ' + path.join(PROFILE, 'chrome.log'))
  })
}

// --- minimal CDP client ------------------------------------------------------

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else for (const fn of this.listeners) fn(msg)
    })
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      this.ws.send(JSON.stringify(payload))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) } }, 30000)
    })
  }
  once(predicate) {
    return new Promise((resolve) => {
      const fn = (m) => { if (predicate(m)) { this.listeners = this.listeners.filter((l) => l !== fn); resolve(m) } }
      this.listeners.push(fn)
    })
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(new CDP(ws)))
    ws.addEventListener('error', (e) => reject(new Error('WebSocket error: ' + (e.message || 'connect failed'))))
  })
}

// --- per-instance tab via a locked registry ----------------------------------

const REGISTRY = path.join(PROFILE, 'webview-tabs.json')
function readRegistry() { try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')) } catch { return {} } }
// Normalize an entry to { targetId, lastUsed, pinned }, migrating the old bare-string format.
function entry(reg, key) {
  const e = reg[key]
  if (typeof e === 'string') return { targetId: e, lastUsed: 0, pinned: false }
  return e && typeof e === 'object' ? e : null
}

// Resolve THIS instance's own page target (create+remember on first use), so
// concurrent instances never drive the same tab. Also refreshes the tab's
// lastUsed heartbeat — that's what keeps an actively-driven tab off the reaper.
async function myTab(cdp) {
  const existing = await cdp.send('Target.getTargets')
  const liveIds = new Set(existing.targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId))
  return await withLock('registry', async () => {
    const reg = readRegistry()
    let e = entry(reg, TAB_KEY)
    if (!e || !liveIds.has(e.targetId)) {
      // A window of its own, in the background: a tab behind another agent's tab in one window is
      // hidden, and Chrome runs no requestAnimationFrame for a hidden tab, so a game there never steps.
      const created = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })
      e = { targetId: created.targetId, pinned: e?.pinned ?? false }
    }
    e.lastUsed = Date.now()
    reg[TAB_KEY] = e
    fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2))
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: e.targetId, flatten: true })
    return { sessionId, targetId: e.targetId }
  })
}

// --- idle reaper: close tabs nobody has touched in a while ---------------------
// Heartbeat-based, NOT a wall-clock timer: a tab you keep driving (or hold the GPU
// lease on, or have pinned) is never reaped — only genuinely abandoned tabs die.
async function reap(cdp) {
  if (TTL_MS <= 0) return
  const lease = readLease()
  const holder = leaseAlive(lease) ? lease.holder : null
  const { targetInfos } = await cdp.send('Target.getTargets')
  const liveIds = new Set(targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId))
  const now = Date.now()
  await withLock('registry', async () => {
    const reg = readRegistry()
    let changed = false
    for (const key of Object.keys(reg)) {
      if (key === TAB_KEY) continue            // never reap the tab we're about to drive
      const e = entry(reg, key)
      if (!e) { delete reg[key]; changed = true; continue }
      if (e.pinned) continue                   // explicitly exempted
      if (holder && key === holder) continue   // the active GPU tester is protected
      if (now - (e.lastUsed || 0) <= TTL_MS) continue
      if (e.targetId && liveIds.has(e.targetId)) {
        try { await cdp.send('Target.closeTarget', { targetId: e.targetId }) } catch { /* already gone */ }
      }
      delete reg[key]; changed = true
    }
    if (changed) fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2))
  })
}

// --- GPU lease: one exclusive tester at a time --------------------------------
// A lease file persisted across invocations so a whole testing session — not just one
// command — holds it. The main thread can pre-acquire to broker turns among subagents.
const LEASE = path.join(PROFILE, 'gpu.lease')
function readLease() { try { return JSON.parse(fs.readFileSync(LEASE, 'utf8')) } catch { return null } }
function leaseAlive(l) { return !!l && Date.now() - (l.heartbeat || 0) <= LEASE_TTL_MS }

async function acquireLease() {
  const deadline = Date.now() + LEASE_WAIT_MS
  for (;;) {
    const got = await withLock('lease', async () => {
      const l = readLease()
      if (!l || l.holder === AGENT || !leaseAlive(l)) {
        fs.writeFileSync(LEASE, JSON.stringify({ holder: AGENT, heartbeat: Date.now() }))
        return true
      }
      return false
    })
    if (got) return true
    if (Date.now() > deadline) return false
    const l = readLease()
    process.stderr.write(`waiting for GPU lease (held by ${l?.holder || '?'})...\n`)
    await sleep(1000)
  }
}
async function releaseLease() {
  return await withLock('lease', async () => {
    const l = readLease()
    if (l && l.holder === AGENT) { try { fs.rmSync(LEASE) } catch {} return true }
    return false
  })
}
// Keep our own lease fresh whenever we touch the page, so a long GPGPU session
// that screenshots periodically never looks dead to other agents.
async function refreshLease() {
  await withLock('lease', async () => {
    const l = readLease()
    if (l && l.holder === AGENT) { l.heartbeat = Date.now(); fs.writeFileSync(LEASE, JSON.stringify(l)) }
  })
}

async function navigate(cdp, sessionId, url, settleMs = 1500) {
  await cdp.send('Page.enable', {}, sessionId)
  const loaded = cdp.once((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId)
  await cdp.send('Page.navigate', { url }, sessionId)
  await Promise.race([loaded, sleep(15000)])
  await sleep(settleMs)
}

// --- CLI ---------------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2)
const browser = await ensureChrome()

if (cmd === 'launch') {
  console.log('chrome up:', browser, '\nprofile:', PROFILE, '\ntab:', TAB_KEY)
  process.exit(0)
}

const cdp = await connect(browser)
await reap(cdp).catch(() => {}) // best-effort idle sweep on every connected command

if (cmd === 'list') {
  const { targetInfos } = await cdp.send('Target.getTargets')
  for (const t of targetInfos.filter((t) => t.type === 'page'))
    console.log(`${t.type} | ${(t.title || '').slice(0, 50)} | ${t.url}`)
} else if (cmd === 'nav') {
  const { sessionId } = await myTab(cdp)
  await navigate(cdp, sessionId, rest[0])
  await refreshLease()
  console.log('navigated:', rest[0])
} else if (cmd === 'window') {
  // Restore (un-minimize) + resize the window holding this tab. A minimized/occluded window is
  // compositor-throttled, which hangs Page.captureScreenshot; a smaller canvas also makes capture
  // far lighter. Usage: window [width] [height]
  const { targetId } = await myTab(cdp)
  const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId })
  const w = Number(rest[0]) || 1280, h = Number(rest[1]) || 860
  try { await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }) } catch {}
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 40, top: 40, width: w, height: h, windowState: 'normal' } })
  await refreshLease()
  console.log('window set', w, h)
} else if (cmd === 'emulate') {
  // Set an EXACT CSS viewport via device-metrics override — the reliable way to test responsive
  // breakpoints. Unlike `window`, this ignores the OS window size entirely (which macOS clamps to
  // a ~500px minimum and sometimes refuses to change at all), so widths like 375 actually render
  // at 375. `emulate off` clears the override and returns to the real window size.
  // Usage: emulate <width> <height> [dpr]   |   emulate off
  const { sessionId } = await myTab(cdp)
  if (rest[0] === 'off' || rest[0] === 'clear') {
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId)
    console.log('emulate cleared (back to real window size)')
  } else {
    const w = Number(rest[0]) || 375, h = Number(rest[1]) || 812
    const dpr = rest[2] ? Number(rest[2]) : 1
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false }, sessionId)
    console.log('emulate set', w, h, '@', dpr + 'x')
  }
  await refreshLease()
} else if (cmd === 'shot') {
  const out = rest[0]
  const url = rest[1]
  const settle = rest[2] ? Number(rest[2]) : 1500
  const { sessionId, targetId } = await myTab(cdp)
  if (url) await navigate(cdp, sessionId, url, settle)
  // NEVER-STEAL-FOCUS (2026-07-04): capture must not raise Chrome over the user's work —
  // no Target.activateTarget, no Page.bringToFront, ever. Surface capture of an occluded
  // window can hang (compositor throttling), so race it with a timeout and fall back to a
  // renderer-side capture (fromSurface:false), which needs no on-screen surface at all.
  // The launch flags above keep occluded pages painting, so neither path needs focus.
  const surface = cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
  let data
  try {
    const r = await Promise.race([surface, sleep(4000).then(() => null)])
    if (r) ({ data } = r)
    else ({ data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false }, sessionId))
  } catch {
    // Surface capture rejected outright (minimized window etc.) — renderer capture instead.
    ;({ data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false }, sessionId))
  }
  fs.writeFileSync(out, Buffer.from(data, 'base64'))
  await refreshLease()
  console.log('wrote', out)
} else if (cmd === 'eval') {
  const { sessionId } = await myTab(cdp)
  const r = await cdp.send('Runtime.evaluate', { expression: rest.join(' '), returnByValue: true }, sessionId)
  await refreshLease()
  console.log(JSON.stringify(r.result?.value ?? r.result, null, 2))
} else if (cmd === 'pin' || cmd === 'unpin') {
  // Exempt (or re-expose) THIS tab from the idle reaper. Pin a tab you'll leave
  // running a long GPGPU computation without screenshotting, so it isn't reaped.
  await myTab(cdp) // ensure the entry exists
  await withLock('registry', async () => {
    const reg = readRegistry()
    const e = entry(reg, TAB_KEY)
    if (e) { e.pinned = cmd === 'pin'; reg[TAB_KEY] = e; fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2)) }
  })
  console.log(cmd === 'pin' ? 'pinned (exempt from reaper):' : 'unpinned (reaper may close when idle):', TAB_KEY)
} else if (cmd === 'acquire') {
  // Block until the exclusive GPU test lease is ours. Exit 2 on timeout so the
  // caller knows to back off rather than pile more load onto the GPU.
  if (await acquireLease()) { console.log('gpu lease: acquired by', AGENT) }
  else { console.error('gpu lease: timed out — another agent is testing; back off and retry'); process.exit(2) }
} else if (cmd === 'release') {
  const ok = await releaseLease()
  console.log(ok ? 'gpu lease: released' : 'gpu lease: not held by us (no-op)')
} else if (cmd === 'close') {
  // Close THIS instance's tab and forget it from the registry — call when you're done driving the
  // page so stale tabs don't pile up in the shared Chrome. Leaves other instances' tabs untouched.
  await withLock('registry', async () => {
    const reg = readRegistry()
    const e = entry(reg, TAB_KEY)
    if (e?.targetId) {
      try { await cdp.send('Target.closeTarget', { targetId: e.targetId }) } catch { /* already gone */ }
      delete reg[TAB_KEY]
      fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2))
    }
  })
  console.log('closed tab:', TAB_KEY)
} else {
  console.error('usage: node --experimental-websocket webview.mjs <launch|list|nav <url>|shot <out.png> [url] [ms]|eval <js>|pin|unpin|acquire|release|close>')
  process.exit(1)
}

process.exit(0)
