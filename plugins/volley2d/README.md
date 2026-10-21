# volley2d

Bullet patterns in a flat world, none of them a row: a rule fires a volley (one ledger entry naming a
pattern, where, which way and by whom) and every bullet of it is a closed-form function of the
volley's age, so the server tests hits and grazes and every page draws hundreds of bullets from the
few numbers that fired them. Fans, rings, spirals, accelerating and curving bullets, patterns built of
patterns, a scrolling frame, grazes and bombs.

## Why use it

Use volley2d for a shoot 'em up, a bullet hell, a twin-stick shooter or a boss's attack patterns. A
hundred bullets on screen cost a packet only the entries that fired them, every seat sees the same
bullets in the same places, and a seat that joins late draws them where they are.

## How it works

**Server half (`volley2d.sim.ts`).** One ledger row: `next`, `live` (the entries) and `frame` (the world
point the frame's origin stands on; bullets fly in the frame, so scrolling the frame with `move`
carries every bullet with the screen). `world.volley2d` holds `patterns` (a loader `json` entry),
`bounds` ([left, top, right, bottom] in the frame) and `layer`.

A pattern is a list of layers. `{ "pattern": name, at?, dir?, after? }` reuses another pattern; every
other layer is an emitter: `n` bullets a burst fanned over `spread` (or a `ring`), `bursts` of them
`every` seconds from `after`, each turned `turn` more (a spiral), `offset`, `from`, `speed`, `accel`,
`min`, `max`, `curve`, `life`, `radius`, `damage`, and the look (`sheet`, `clip`, `orient`, `layer`).
Angles are radians from the world's x toward its y.

Every bullet a volley can fire is numbered (`shots`), and an entry keeps which are `gone` and which
have `grazed`. Each step ages every entry, retires bullets past their life or out of bounds, and drops
an entry whose bullets are all fired and gone.

- `fire(w, pattern, at, dir, side)`: adds a volley and hands it back.
- `move(w, to)`: sets the frame's point.
- `strike(w, side, targets)`: hits what `side`'s bullets meet, each target `{ id, pos, r, graze? }`;
  hands back every hit `{ id, damage, entry, k, pos }` and every graze, and the rule does what a hit
  does.
- `clear(w, side)`: takes every bullet of a side out of the air (a bomb), handing back where each was.
- `points(shots, entry, frame)`: every bullet of an entry in the air now, `{ k, pos, heading, shot }`;
  `ahead` a bullet's place a little later, for a bot that dodges.

**Browser half (`volley2d.plugin.ts`).** Each frame draws every bullet of every entry where its age
puts it, frame 0 of its `clip`, turned along its heading with `orient`, one sprite per bullet for its
whole life so render2d draws it between steps. `fire(pattern, at, dir)` on the page fires a preview
volley on no row, drawn exactly as a row's.

## Using it

1. List `volley2d` before `render2d`; add one `volley2d` row (`{ "next": 0, "live": [], "frame": [0, 0] }`);
   give `world.volley2d: { patterns, bounds, layer }` and catalogue the patterns file and the sheets.
2. In the boss's rule: `fire(w, 'spiral', me.data.pos, Math.PI / 2, 'enemy')`.
3. In the player's rule: `const { hits, grazes } = strike(w, 'enemy', [{ id: me.id, pos: me.data.pos,
   r: 0.1, graze: 0.4 }])`.

## Plugins it works with

- **render2d**: the layers bullets are drawn on, and drawing between steps.
- **loader**: the patterns file and the sheets.
- **playtester**: a bot reads `points` and `ahead` to dodge.
- **volley3d** is the 3D counterpart.
- **math**: deterministic maths.

## Keywords

bullet hell, danmaku, shmup, shoot em up, bullet patterns, spiral, fan, ring, spread shot, boss
patterns, projectiles, bullets, graze, bomb, clear bullets, scrolling, closed form, deterministic,
network efficient, ledger, `fire`, `strike`, `clear`, `move`, `points`, `world.volley2d`
