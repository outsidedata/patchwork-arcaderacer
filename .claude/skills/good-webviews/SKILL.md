---
name: good-webviews
description: Use when you need to view, screenshot, or drive a web page / local dev server in a real Chrome — "look at it in chrome", "screenshot the site", "open localhost", browser automation. Self-launches Chrome over CDP (no MCP), works with multiple Claude instances at once. Replaces the flaky chrome-connect skill.
---

# good-webviews

Drive a **real, visible Chrome** over the Chrome DevTools Protocol — navigate, screenshot, eval JS. No MCP server, no puppeteer, no npm installs. If no debug-enabled Chrome is running, the helper **launches one itself**. Safe to use from **many Claude Code instances at once**: they share one browser, each drives its own tab.

The helper is `webview.mjs` next to this file. Node 20 has no global `WebSocket`, so always run it with `--experimental-websocket`.

## Why this exists (the two traps that broke chrome-connect)

1. **Chrome refuses the debug port on the default profile.** It logs `DevTools remote debugging requires a non-default data directory` and the port never binds — connections are silently refused even though `--remote-debugging-port` is on the command line. **Fix: always launch with a dedicated `--user-data-dir`.** This helper does that automatically.
2. **Concurrency races.** Two instances both see "not up" and both launch on the same profile+port; the second dies on the profile SingletonLock. **Fix: a launch lock** (one launches, the rest wait for the port) **+ a per-tab registry** so instances don't clobber each other's page.

## Quick reference

```bash
SKILL_DIR="$HOME/.claude/skills/good-webviews"
# Each agent already gets its OWN tab automatically (keyed by CLAUDE_CODE_SESSION_ID).
# You only set WEBVIEW_TAB to FORCE sharing, or to run several tabs from one agent.

node --experimental-websocket "$SKILL_DIR/webview.mjs" launch                 # ensure Chrome is up
node --experimental-websocket "$SKILL_DIR/webview.mjs" shot /tmp/p.png http://localhost:5173/   # navigate + screenshot
node --experimental-websocket "$SKILL_DIR/webview.mjs" shot /tmp/p.png http://localhost:5173/ 8000  # wait 8s for WebGL/heavy paint
node --experimental-websocket "$SKILL_DIR/webview.mjs" nav  http://localhost:5173/
node --experimental-websocket "$SKILL_DIR/webview.mjs" window 900 1000            # resize the window (responsive testing)
node --experimental-websocket "$SKILL_DIR/webview.mjs" eval "document.title"
node --experimental-websocket "$SKILL_DIR/webview.mjs" list                   # all open tabs
node --experimental-websocket "$SKILL_DIR/webview.mjs" pin                    # exempt this tab from the idle reaper
node --experimental-websocket "$SKILL_DIR/webview.mjs" unpin                  # re-expose it
node --experimental-websocket "$SKILL_DIR/webview.mjs" acquire               # take the exclusive GPU test lease
node --experimental-websocket "$SKILL_DIR/webview.mjs" release               # drop it
node --experimental-websocket "$SKILL_DIR/webview.mjs" close                  # close THIS agent's tab when done
```

Then **`Read` the PNG** to actually look at it. A non-empty PNG is proof the connection works.

## Resizing for responsive testing — two commands, and they are NOT interchangeable

There are two ways to change the size, and picking the wrong one silently wastes a debugging
session. **This is the thing other sessions get wrong.**

- **`window W H`** — resizes the real OS window (CDP `Browser.setWindowBounds`). This fires
  `resize` events **and ResizeObserver**, so the page reflows exactly like a user dragging the
  window edge. **Use this to test responsive behavior**, especially charts/components that
  re-measure via ResizeObserver (d3/SVG, `useSize`-style hooks).
- **`emulate W H [dpr]`** (`emulate off` to clear) — sets an exact CSS viewport via
  `Emulation.setDeviceMetricsOverride`. Reliable for hitting a precise width (incl. sub-500px
  phone widths the OS window can't reach) for a **static** screenshot.

```bash
node --experimental-websocket "$SKILL_DIR/webview.mjs" window 640 1000   # real resize (fires ResizeObserver)
node --experimental-websocket "$SKILL_DIR/webview.mjs" shot /tmp/p.png   # THEN capture (separate call)
node --experimental-websocket "$SKILL_DIR/webview.mjs" emulate 375 812   # exact viewport, no reflow events
node --experimental-websocket "$SKILL_DIR/webview.mjs" emulate off       # clear the override
```

Gotchas, each learned the hard way:

- **`emulate` does NOT fire `resize` or ResizeObserver.** It changes layout, but a chart that
  redraws on RO stays frozen at its mount width — so `emulate` makes RO-based components *look*
  broken (or *look* fine) regardless of the truth. **To test resize behavior, use `window`.**
  Reserve `emulate` for one-shot fixed-width captures of static layouts.
- **A live `emulate` override pins the size and blocks `window`.** After emulating, `window` and
  even real resizes appear stuck at the emulated width until you run `emulate off`. If `window`
  seems frozen: `emulate off`, and if still stuck, `close` the tab and let the next call reopen it.
- **`window` and `shot` are separate calls.** Resize first, then screenshot. `shot` takes no size.
  (`shot` with a URL navigates; call it with no URL to re-capture the current page.)
- **Don't resize with `eval`.** `window.resizeTo()` / `innerWidth =` are no-ops on a CDP tab.
- **Very small `window` widths may be OS-clamped** (macOS won't make a real window ~<450px). For
  true phone widths use `emulate` — but remember it won't fire RO.
- **Give layout a beat to settle** — `sleep ~0.5` between `window` and `shot`/measure, so RO has
  ticked and the redraw has landed before you capture.
- Default size: `window` → `1280×860`, `emulate` → `375×812 @1x`.

## Tab lifecycle — tabs close themselves, but you should still close yours

Every invocation refreshes **this tab's** "last used" timestamp and sweeps any tab that's been **idle longer than the TTL (default 10 min)** — those self-close so the shared Chrome never silently fills with dead tabs. A tab you keep driving (`shot`/`nav`/`eval`) stays alive indefinitely; only *abandoned* tabs get reaped. This is heartbeat-based, **not** a wall-clock kill timer — it will never yank a tab out from under active work.

Still: **run `close` when you're done** with a page. The reaper is the backstop for crashes and walk-aways, not a substitute for cleanup — closing immediately frees the GPU/tab instead of waiting out the TTL. Your next call recreates the tab if needed.

## Long-running work — `pin` before you walk away

The reaper decides "idle" from the **last webview command**, not from what the page is doing. If you kick off a long GPGPU computation and then *don't* screenshot it for >10 min, the reaper would treat the tab as abandoned and close it mid-run.

**Before leaving a long run untouched, `pin` the tab** — pinned tabs are exempt from the reaper. `unpin` (or `close`) when the run is done. If you'd rather disable reaping entirely for a one-off, set `WEBVIEW_TTL=0` on that invocation.

## Multi-agent GPGPU — the broker protocol

Concurrent GPGPU across many tabs thrashes the GPU and corrupts results. So **only one agent tests at a time**, enforced by an exclusive **GPU lease**:

- Any agent about to do GPGPU work runs **`acquire`** first — it blocks until the lease is free, then claims it. If it can't get the lease within `WEBVIEW_LEASE_WAIT` (default 300s) it **exits 2**: that's your signal to back off, not to pile on.
- Run your `shot`/`nav`/`eval` while holding it (each refreshes the lease heartbeat), then **`release`**.
- A crashed holder's lease auto-expires after `WEBVIEW_LEASE_TTL` (default 120s) so the lease can't deadlock.

**When dispatching subagents to test:** the **main thread is the broker**. Have it `acquire` the lease and hand out turns — each subagent `acquire`s before testing and `release`s after, so they serialize instead of fighting over the GPU. The active lease holder's tab is also protected from the reaper.

## Rules

- **Never** search for or use a chrome-devtools MCP server. This connects over the port.
- **Close the tab when you're finished** (`webview.mjs close`); the idle reaper is only a backstop.
- **Don't set `WEBVIEW_TAB` unless you mean to.** It defaults to your per-agent session id, so agents already get separate tabs. Set it only to force two agents to share a tab, or to drive multiple tabs from one agent.
- **`pin` long-running tabs** you'll leave untouched past the TTL; `acquire`/`release` the GPU lease around GPGPU testing.
- This skill **does not start your dev server**. Start it separately (`npm run dev`) and screenshot the URL/port it prints — don't assume 5173; Vite walks to 5174/5175/… when ports are taken.
- For WebGL / Three.js / heavy SPAs, pass a settle time (e.g. `8000`) so the scene paints before capture.
- If launch fails, the error names the log: `~/.chrome-cdp-profile/chrome.log`. Read the actual error; don't reinvent the connection.

## Env overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `WEBVIEW_TAB` | `$CLAUDE_CODE_SESSION_ID` | per-agent tab key — leave unset; override only to force sharing |
| `WEBVIEW_TTL` | `600` | idle-reap age in **seconds**; `0` disables reaping for that run |
| `WEBVIEW_LEASE_TTL` | `120` | seconds before a silent GPU-lease holder is presumed dead |
| `WEBVIEW_LEASE_WAIT` | `300` | seconds `acquire` blocks before giving up (exit 2) |
| `WEBVIEW_PORT` | `9222` | debug port (keep equal across instances to share one Chrome) |
| `WEBVIEW_PROFILE` | `~/.chrome-cdp-profile` | dedicated user-data-dir (the thing that makes the port bind) |
| `WEBVIEW_CHROME` | auto | explicit Chrome binary path (tries Chrome Dev → Chrome → Chromium) |

## Common mistakes

- **Reusing the user's normal Chrome.** It won't open the port on its default profile — that's the whole bug. This uses a separate `~/.chrome-cdp-profile` window. That's expected, not a problem.
- **Wrong port.** A 200 on `localhost:5173` may be a *different* project. Verify with `eval "document.title"` or by screenshotting before trusting the port.
- **Screenshot is blank/half-rendered.** Increase the settle ms argument on `shot`.
