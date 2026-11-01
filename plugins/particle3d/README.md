# particle3d

3D particle effects for render3d: camera-facing quads from sheets or flat squares, bursts and
streams with speed, spread, gravity, drag, pull, swirl round a line, pacing, spin, tint that cools, fade, additive
light and bloom-bright gain, stretch along the motion, beams and tracers to a target, particles that
carry real point lights, effects that fly and throw more where they land, effects that ride on a
row, and every seat drawing the same particles, all in one draw per sheet and blend.

## Why use it

Use particle3d for explosions, muzzle flashes, sparks, smoke, dust kicked up by wheels, exhaust,
blood and gore, magic, tracers and lasers, rain splashes, embers, a smouldering wreck, a comet's
trail. A particle is drawn and never read by a rule, so no particle is a row: a rule says once which
effect, where and for how long, and each page draws the rest from the same seed.

## How it works

**Server half (`particle3d.sim.ts`).** One `particle3d` row is the ledger: `next` and `live` and
nothing else. `emit(w, effect, at, spawn)` adds an entry at a world point `[x, y, z]` in metres (y up)
with the spawn's `life`, `dir`, `to`, `tint`, `scale`, `floor`, `from`, `fly`, `land`, and hands it
back; `entry(w, id)` finds it again, and a rule moves it by writing `at` or stops it by writing
`life`. Each step ages every entry and drops those past their life, or past `world.particle3d.hold`
when that is longer, so a page that takes two packets in a frame still sees it. An entry `from` a row
stays while the row is there.

**Browser half (`particle3d.plugin.ts`).** The page's own ledger of live effects. It takes each
ledger entry the first frame it sees it (rolling bursts it missed, so a late page draws what an
early one does), and anything on the page can `emit(...)` an effect of its own (box3dvehicle's
exhaust and dust, dismember3d's gore), seeded or not. `emit` hands the effect back: writing its
`at`, `dir` or `to` moves it, `life` stops it, `floor` is the height its particles rest on (box3dvehicle
writes the ground under a wheel each frame), `rate` (1 as handed back) runs its bursts that many times
as often, 0 throwing nothing new until it is written again, and `force` (1 as handed back) throws
every particle from then on that many times as hard. A `rate` or `force` that is not a finite number
of 0 or more throws, naming the effect. Every particle is a quad facing the camera; all
the particles on one page of one sheet and one blend are one mesh whose buffers are written every
frame.

The effects are a data file (the loader entry `world.particle3d.effects` names) with `cap`,
`alphaTest`, `ppm` (sheet pixels per metre) and `effects`, each a list of layers. A layer
`{ "effect": name, "at"? }` reuses another effect; every other layer is an emitter, in metres and
seconds: `n`, `every`, `after`, `life` or `lasts`, `skip`, `sheet` and `clip` (with `play`), `size`,
`grow`, `dir`, `spread`, `speed`, `jitter`, `box`, `g`, `drag`, `pull`, `swirl` and `axis` (carried
round the point it was thrown from, a vortex or a whirlpool), `pace`, `follow`, `flips`,
`tint`, `tint1`, `gain` (above 1 brighter than white, for render3d's `bloom`), `a0`, `a1`, `fade`,
`spin`, `origin`, `add`, `stretch`, `face`, `beam`, and `light: { intensity, distance, decay }`, a
real point light on each particle (which needs lights3d). An unknown field throws, naming it.

## Using it

1. List `particle3d` before `render3d` (after it, particles face last frame's camera and that
   throws), add one `particle3d` row (`{ "next": 0, "live": [] }`), and give
   `world.particle3d: { effects, hold }`.
2. Write the effects file and catalogue it, with any sheets it names.
3. In a rule: `emit(w, 'blast', pos, { scale: 2, land: [{ effect: 'smoke' }] })`. On the page:
   `plugins.particle3d.emit('spark', at, { seed })`; `plugins.particle3d.has(name)`.

## Plugins it works with

- **render3d**: the scene and camera the quads face, and its `bloom` for bright particles.
- **lights3d**: draws every particle's `light`; particle3d throws when a layer has one and the scene
  does not list lights3d.
- **loader**: the effects file and the sheets.
- **box3dvehicle**: its exhaust and dust are particle3d effects.
- **dismember3d**: its sever burst and drip are particle3d effects.
- **particle2d** is the 2D counterpart.

## Keywords

particles, particle system, 3D particles, VFX, billboards, camera-facing quads, emitter, burst,
explosion, muzzle flash, sparks, smoke, dust, exhaust, fire, embers, blood, gore, magic, tracer,
beam, laser, trail, impact, gravity, drag, swirl, vortex, whirlpool, portal, spiral, orbit, spread, fade, additive blending, bloom, HDR, glow, particle
lights, sprite sheet particles, batching, one draw call, deterministic particles, seeded, late join,
ledger, three.js, render3d, `emit`, `entry`, `world.particle3d`
