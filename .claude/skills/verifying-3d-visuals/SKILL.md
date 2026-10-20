---
name: verifying-3d-visuals
description: Use when developing, reviewing, or judging any 3D scene, render, WebGL/WebGPU/Three.js view, shader, animation, model, or game visual — before claiming it "looks good", "works", "is fixed", "is done", or "is ready". Triggers whenever you are about to assess a 3D result from a screenshot, or whenever you feel "done" / want to stop after something merely renders.
---

# Verifying 3D Visuals

## The core problem — your two real limitations

You have two limitations that wreck 3D work. Both are real. Neither goes away by trying harder in the moment — only the mechanical process below compensates. Do not trust your in-the-moment judgment; trust the process.

1. **You cannot see systematically.** You CAN see images, but not well, and not thoroughly. You miss z-fighting, inverted normals, clipping, scale errors, banding, seams, intersection artifacts, blown-out highlights, and broken geometry — especially from a single angle. A 3D scene is a volume over time; one screenshot is one 2D projection at one camera, one frame, one lighting state. **It is physically incapable of revealing most 3D defects.** You will look at a flawed render and feel sure it's fine. That feeling is not evidence. The only way you see anything real is by capturing a fixed, complete SET of views and inspecting each against a checklist — never by glancing once and trusting the impression.

2. **You give up early because you love to stop.** This is the bigger failure. The instant something renders — "no console errors, something appeared" — you feel done and you quit. You'll even wander off into tangents to avoid the boring, systematic looking. You declare a verdict before you've actually examined the thing, because stopping feels like success. It is not. Finishing the look is the work. "It renders" is not "it's correct," and "I glanced at it" is not "I checked it." Your job is to keep looking, adversarially, until you've covered the whole set — not to find the first excuse to be done.

**Renders without errors ≠ looks good. One screenshot ≠ verified. Feeling confident ≠ checked. Wanting to stop ≠ being done.**

## The Iron Rule

**Never judge a 3D result from a single screenshot, never report a verdict you did not actively try to disprove, and never stop looking before you've covered the full set of views.**

If you have one screenshot, you have not verified anything. If you feel "done" before you've gone through every required view and the whole checklist, you are not done — that feeling is the bug. Say what you have, then keep going.

## What you MUST capture before any verdict

Minimum, every time:

- **≥3 distinct camera angles** — not the default view alone. Orbit the subject (e.g. front, 3/4, opposite side, top, limb/silhouette). Defects hide on the side you didn't look at.
- **The silhouette / edge-on view** — reveals scale, intersection, clipping, atmosphere/rim falloff, flat-blob problems.
- **For anything animated or time-varying: ≥3 frames** — start, middle, end, plus any state transition (launch, impact, fragment, fade). Motion glitches are invisible in a still.
- **Any state the change actually touched** — if you edited the night-side shader, capture the night side. If you edited fragmentation, capture mid-break and post-break.

If you cannot capture multiple views (tooling limits, no deterministic seek), **say that explicitly** and downgrade your claim to "rendered, NOT visually verified." Do not paper over it. See the project's screenshot/timing memories for deterministic capture (pause + step to a known frame, render-on-demand — never sleep-then-shoot a realtime sim).

## How to capture — use `good-webviews`

"No tooling" is almost never a real excuse: the **`good-webviews`** skill drives a real, visible Chrome (with WebGPU/WebGL) over the DevTools protocol — navigate, run JS, screenshot — and launches Chrome itself if none is up. Invoke that skill for full docs; the capture loop that works:

```bash
SKILL_DIR="$HOME/.claude/skills/good-webviews"
export WEBVIEW_TAB="$(basename "$PWD")"          # per-instance tab; don't let instances stomp each other
W(){ node --experimental-websocket "$SKILL_DIR/webview.mjs" "$@"; }
W launch
W shot /tmp/v0.png http://localhost:PORT/ 8000   # nav + settle (WebGL/WebGPU needs a few s to paint)
```

Then **drive state with `eval`, capture with `shot` (NO url), and `Read` each PNG.** `shot <file> <url>` re-navigates = resets the scene; `shot <file>` alone captures the CURRENT state — that's how you hold one frame and orbit it:

```bash
# deterministic: pause, seek to a known frame, set the angle — ALL in one eval (synchronous,
# so the realtime rAF loop can't interleave extra steps), then settle, then capture.
W eval "(()=>{const v=window.__APP__; v.setRunning(true); v.advance(2000); v.setRunning(false); v.orbit(40,18); return 'ok';})()"
sleep 2 ; W shot /tmp/a.png
W eval "(()=>{window.__APP__.orbit(140,22); return 'ok';})()" ; sleep 1.5 ; W shot /tmp/b.png   # same frame, new angle
```

Capture the ≥3 angles + frames the Iron Rule requires this way, then `Read` every PNG and run the checklist on each.

### Traps that make you verify the WRONG thing (all hit in practice)

- **Stale code — the big one.** A page holds every module it imported, as it was, until it reloads, so with HMR off a page left open shows the code from *before* your edit, and you screenshot the OLD behavior and "confirm" a fix that isn't loaded. **Reload the page** (navigate to it again) before trusting any post-edit capture: Vite with `hmr:false` still watches the files and serves a changed one on the next load. Only a server whose watcher is off (`server.watch: null`) or that serves a cached build must be **restarted** (`kill $(lsof -ti tcp:PORT); npm run dev &`). In core, `yarn editor` tells its own editor pages of every change and they reload or take it in themselves; a game page opened directly (`games/<game>/index.html`) needs the reload. Sanity-check that an asset only your change could produce is actually present.
- **Async readouts lag the pixels.** GPU/worker read-backs (a telemetry scalar, an "alive count") often haven't resolved when your synchronous `eval` returns — they under-report. Trust the rendered geometry, not a stale number. Re-`eval` after a `sleep` if you need the scalar.
- **The helper's `eval` doesn't await promises** (an async expression returns `{}`). Use synchronous checks, or stash the result on `window` and read it back. Confirm the renderer is real first: `W eval "typeof navigator.gpu"` → `"object"`, and `W eval "document.title"` to prove you're on the right app/port (a 200 can be a different project).
- **Gizmos look like bugs.** Heat arrows, axis helpers, light widgets read as "shards/spikes" in a still — identify the scene's helper objects before calling one a defect.

## Look adversarially — the defect checklist

For EACH captured view, actively hunt for these. Do not ask "does it look okay?" Ask "what is wrong here?":

- Geometry: holes, inverted/inside-out normals, missing faces, clipping through other objects, parts in the wrong place or wrong scale
- Z-fighting / flicker / overlapping coplanar surfaces
- Seams, texture stretching, UV errors, repeated/tiled artifacts
- Lighting: blown-out white blobs, crushed blacks, banding, terminator wrong, flat/unlit regions
- Shader edges: rim/glow falloff, halos, hard cutoffs where there should be gradients
- Proportion / scale errors vs. what the thing should be
- Bloom/exposure overdone (bloom is almost always overdone — restrained by default)
- Anything that only appears or only disappears between frames

## Report what you checked, not just the conclusion

State, per view, what you actually observed — and call out what you could NOT verify.

❌ "Looks good now."
✅ "Captured 4 angles + 3 spin frames. Front/3-4: rim falloff is smooth, no halo. Limb view: atmosphere thickness reads right, no hard cutoff. Night side: city lights visible, slight banding in the terminator (frame 2). Could NOT verify motion smoothness — only static frames. Banding is the one open issue."

A verdict with no per-view observations is a tell that you didn't look.

## Red flags — STOP, you are about to ship the failure

- "It renders without errors, so it's good"
- "I only have one screenshot but it looks fine"
- "It probably looks the same from other angles"
- "Good enough, moving on"
- "I'm confident this works" (without having looked adversarially)
- Reporting "looks good" / "fixed" / "done" with zero per-view observations
- Skipping capture because re-capturing is tedious
- Feeling relieved/finished the instant it rendered — that relief is the trap
- Wandering into a side-task instead of finishing the systematic look
- Quitting the inspection partway because you "get the idea"

**Every one of these means: you are stopping too early. Capture the FULL set of views, look for what's wrong in each, then report.**

## Rationalization table

| Excuse | Reality |
|--------|---------|
| "It rendered, no errors" | Rendering is the floor, not the bar. Broken geometry renders fine. |
| "One screenshot is enough" | One projection hides most 3D defects by construction. Get ≥3 angles. |
| "It looks good to me" | Your vision is lossy and biased toward success. Feeling ≠ verification. |
| "Other angles are probably fine" | "Probably" is the exact gap defects live in. Go look. |
| "Re-capturing is slow" | Slower than the user catching the bug you shipped? No. |
| "I'll spot problems if there are any" | You won't, passively. Only the adversarial checklist surfaces them. |
| "It's a small change" | Small changes break things off-camera too. Capture the touched state. |
| "It rendered, I feel done" | That relief is the failure firing. Done = full set captured + checklist run, nothing less. |
| "I get the idea, I can stop" | You stop because you love stopping, not because you've looked. Finish the set. |
| "Let me go do this other thing first" | That's avoidance of the boring systematic look. Finish the look first. |

## Bottom line

You cannot see systematically, and you love to stop — you'll call it done the moment it renders. Both are why your 3D work disappoints. The only defense is mechanical and you must run it to completion: the full set of angles and frames, an adversarial checklist on each, and a per-view report that admits what you couldn't verify. The job isn't done when it renders; it's done when you've finished looking. Don't stop early.
