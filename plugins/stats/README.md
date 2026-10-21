# stats

three.js's own stats panel (`three/addons/libs/stats.module.js`, the one in every three.js demo) over
the page: frames a second, milliseconds a frame, and in Chrome the megabytes of heap. A click on the
panel shows the next one.

## Why use it

Use stats while building or tuning a game, in a testbed page, to watch the frame rate and frame time
as you change a scene.

## How it works

stats has no row, no numbers and no server half. The page calls `plugins.stats.mount(parent)` to name
where the panel goes; the first `afterTick` after that puts it there, fixed at the window's top left
over everything, and starts its clock, and each `afterTick` from then counts a frame, so the first
frame counted is a whole one. Each scene's client has its own panel, which starts counting afresh;
`close` takes it off the page.

## Using it

List `stats` in the scene's `plugins` after the plugins that draw (render2d, render3d), so a frame
is counted once it is drawn, and mount it from the page: `client.plugins.stats.mount(document.body)`.
A `dev.html` testbed is its home.

## Plugins it works with

- **render2d** / **render3d**: listed after them, it counts each drawn frame.

## Keywords

FPS, frame rate, frames per second, frame time, ms, memory, heap, performance, profiling, stats.js,
three.js stats, debug overlay, testbed, `mount`
