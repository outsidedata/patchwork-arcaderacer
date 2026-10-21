# particle2d

2D particle effects for a render2d world: bursts and streams of particles from sheets or flat
squares, with speed, spread, gravity, drag, pull, pacing, spin, tint that cools, fade, additive
light, stretch along the motion, beams and tracers to a target, effects that fly from one point to
another and throw more effects where they land, effects that ride on a row, and every seat drawing
the same particles.

## Why use it

Use particle2d for explosions, sparks, smoke, dust, blood, magic, muzzle flashes, tracers, lasers,
rain splashes, pickups glittering, fire on a wreck, a comet's trail. A particle is drawn and never
read by a rule, so no particle is a row: a rule says once which effect, where and for how long, and
each page draws the rest from the same seed.

## How it works

**Server half (`particle2d.sim.ts`).** One `particle2d` row is the ledger: `next` and `live` and
nothing else (any other field throws). `emit(w, effect, at, spawn)` adds an entry with the effect's
name, its world point `at` (`[x, y]` or `[x, y, h]`, as render2d reads one), its `age`, and the
spawn's `life`, `dir`, `to`, `tint`, `scale`, `floor`, `from`, `fly`, `land`, `layer`. It hands the
entry back; `entry(w, id)` finds it again, and a rule moves it by writing `at` or stops it by writing
`life`. Each step ages every entry and drops those past their life, or past `world.particle2d.hold`
when that is longer, so a page that takes two packets in a frame still sees it. An entry `from` a row
stays while the row is there.

**Browser half (`particle2d.plugin.ts`).** The page's own ledger of live effects. It takes each
ledger entry the first frame it sees it (rolling any bursts it missed, so a late page draws what an
early one does), and anything on the page can `emit(...)` an effect of its own, seeded or not.
Particles are pooled sprites in containers on the effect's render2d layer: on a layer that sorts,
each effect is sorted by its point's depth, so a burst behind a wall draws under it.

The effects are a data file (the loader entry `world.particle2d.effects` names) with `cap` (the most
particles at once), `layer`, `ppm` (sheet pixels per stage pixel), and `effects`, each a list of
layers. A layer `{ "effect": name, "at"? }` reuses another effect; every other layer is an emitter:
`n`, `every`, `after`, `life` or `lasts`, `skip`, `sheet` and `clip` (with `play`), `size`, `grow`,
`dir`, `spread`, `speed`, `jitter`, `box`, `g`, `drag`, `pull`, `pace`, `follow`, `flips`, `tint`,
`tint1`, `gain`, `a0`, `a1`, `fade`, `spin`, `origin`, `add`, `stretch`, `face`, `beam`. Lengths
and speeds are the stage's pixels as seen on the screen. An unknown field throws, naming it.

A spawn's `scale` scales every length; `floor` stops particles at a height above the ground; `from`
rides the effect on a row's `pos`; `fly` carries the point from `at` to `to`; `land` throws effects
where it lands.

## Using it

1. List `particle2d` before `render2d` (after it, particles lag a frame and that throws), add one
   `particle2d` row (`{ "next": 0, "live": [] }`), and give `world.particle2d: { effects, hold }`.
2. Write the effects file and catalogue it, with any sheets it names.
3. In a rule: `emit(w, 'explosion', me.data.pos, { scale: 2 })`. On the page:
   `plugins.particle2d.emit('sparkle', at, { seed })`; `plugins.particle2d.has(name)` once the file
   has been read.

## Plugins it works with

- **render2d**: the layers particles are drawn on and the projection of each world point.
- **loader**: the effects file, and the sheets its emitters draw from (`play`, `clip`).
- **sprite2d**: a thing's sprite at the same depth is drawn under its effect.
- **particle3d** is the 3D counterpart.

## Keywords

particles, particle system, particle effects, VFX, emitter, burst, explosion, sparks, smoke, dust,
fire, blood, magic, muzzle flash, tracer, beam, laser, trail, projectile, impact, landing effect,
gravity, drag, spread, fade, additive blending, glow, stretch, sprite sheet particles, pixel art,
deterministic particles, seeded, late join, ledger, render2d, PixiJS, `emit`, `entry`,
`world.particle2d`
