# Hits and dismember3d Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One way a shot or a round hurts anything in every 3D game. hitscan3d and volley3d deliver
the hit, carrying what the shooter's weapon does, to the struck row's one `hit` act, against the
body's real shapes. Then horde's dismemberment is lifted into core as `dismember3d`, and horde's
farmers are hit, cut and gored by it.

**Architecture:** Phase A overhauls hitscan3d and volley3d:
- A body is a list of named shapes (upright cylinders and capsules) handed by the `bodies` mod.
- `shoot` and `fire` take a `hurt` (the weapon's damage and whatever else it carries) and call the
  struck row's `hit` with it, plus the part, the point and the way the shot travelled.
- Every game moves onto that path: horde, mech and shooter.

Phase B lifts horde's `plugins/limbs` and `plugins/joints`, and the farmer's cutting logic, into
`plugins/dismember3d`:
- Bone positions come from the rig's `ends`.
- The Mixamo limb table is a default in the plugin.
- The scene gives only gore.

**Tech Stack:** TypeScript on node and the browser, three.js, box3d, the engine's rows, acts and mods.

**Spec:** this conversation. Bill's words: anything measurable from the model comes from the anim
bake; anything the same for every Mixamo body is a plugin default; the scene keeps only real
choices; a game makes one call for the event; hitscan/volley3d first; old systems are not kept
running beside the new one.

## Global Constraints

- **No tests are touched or run.** No `*.test.ts`, no `*.test.tsx`, no `yarn test`, no `yarn vitest`.
  `yarn tsc` and `yarn lint` are run. A `yarn tsc` error inside a test file is expected and listed in
  the report; an error anywhere else is a defect.
- The engine (`engine/`) is not edited.
- `games/` is its own repo. Make branch `hits` in core (`git checkout -b hits`) and in games
  (`git -C games checkout -b hits`), both from `dev`. Commit each repo's changes in that repo.
- Every rule and server mod computes with `#plugins/math/math.sim.ts` (`math.sin`, `math.hypot`, …),
  never `Math.sin`/`Math.cos`/`Math.atan2`/`Math.hypot`.
- One plain step per Bash call. No `&&`, pipes or `$(...)`. Files are read with Read.
- Subagents run on Opus. No git worktrees.
- Each changed file's header is rewritten to say what the code now does, in the voice of the headers
  around it. Docs that describe hitscan3d, volley3d's `landed`, or horde's limbs are fixed in the
  same task as the code: `.claude/skills/using-3d-physics/SKILL.md`, `games/mech/README.md`,
  `games/horde/README.md`, and every line of `.claude/skills/*/SKILL.md` that names `landed`, `parts`
  of hitscan3d, `plugins/limbs` or `plugins/joints` (find them with `grep -rn` at the start of each
  task).
- The editor is on hold: `*.extension.tsx`, `*.components.tsx`, `*.route.ts` and `editor/` are not
  changed, and an error the change causes there is not fixed.

## What Bill approves before any task

The prime directive says every new piece of a top-level plugin is asked for in planning. This plan
adds:

1. **hitscan3d** (reshaped):
   - `Body` becomes `{ id, kind, pos, shapes }`.
   - `world.hitscan3d.kinds.<kind>` becomes `{ off?, tall? }`, and `parts` goes.
   - `shoot` takes `hurt` and calls the struck row's `hit`.
   - New export `Hurt` and `Struck` types.
2. **volley3d**:
   - `fire` takes `hurt`.
   - A round's direct hit is delivered through `shoot`, and its splash calls `hit` on each body
     splashed.
   - The `landed` act is no longer called at all.
3. **anim**: `ends(w, me, segment, at?)` moves into `plugins/anim/anim.sim.ts` from ragdoll3d, so
   ragdoll3d and dismember3d read the rig's ends one way.
4. **ragdoll3d**: a new mod `plugins/ragdoll3d/ragdoll3d.hitscan3d.ts`, `bodies`. It gives a standing
   anim body's bone capsules, the ones its `capsules` already makes for a weapon, chained to
   `world.ragdoll3d.mods.bodies` for every other body. `struck` leaves ragdoll3d (hitscan3d tests
   capsules now).
5. **dismember3d**: a new top-level plugin, `plugins/dismember3d/`. Its server half, its page half, and
   its mod `dismember3d.hitscan3d.ts`, `bodies`.
6. **terrain3d**: a new page mod `plugins/terrain3d/terrain3d.dismember3d.ts`, `land`, the floor gore
   comes to rest on. This is the same as `terrain3d.ragdoll3d.ts`.

**Names this plan introduces** (Bill gave `dismember3d`; these are mine, change any and the plan
follows):
- `hurt`: what a weapon does, handed to `shoot` and `fire`.
- `Struck`: the object `hit` receives.
- `shapes`, `cylinder`, `capsule`: a body's shapes.
- `pieces(w, body)` and `PIECES`: dismember3d's piece rows and piece kinds.
- `spared`: mech's own-team splash check.

**Two behaviour changes, stated:**
- **Mech:** a launched round's damage is fixed when it is fired. Today a round whose module has been
  taken off its mount since then hurts nothing (`modules.sim.ts:528`). After this change it hurts.
- **Horde's shotgun (blast):** today every pellet of a pull that meets a victim is gathered, and the
  victim dies once, pushed by all of them (`player.sim.ts:62-86`). With `shoot` delivering each
  pellet, the first pellet kills, the victim is `limp`, and the rest of that pull's pellets pass
  through it. Keeping every pellet's push needs ragdoll3d to take pushes on a ragdoll in the step it
  was made: a new export, which Bill approves or not. Task 6 builds whichever he says.

## Review Focus

1. **A shot aimed back with `seen` at a body that has since ended, or turned limp.** The kept shapes
   of a body that has ended are not hit, and a body whose `off` field is true now is not hit (as
   today, `hitscan3d.sim.ts:108-130`). Task 1 keeps both rules in `bodiesAt` and `upright`.
2. **A `hurt.damage` table that has no entry for the struck part.** Shooter's table must name every
   segment. Task 1's `shoot` throws `hitscan3d: <kind> was struck on <part>, and the hurt names no
   damage for it`, and Task 5 writes all 14 segments.
3. **A splash with a damage table.** volley3d scales a number. Task 3's splash throws naming the
   pattern when `hurt.damage` is not a number.
4. **A guided round seeking a body made of capsules.** The middle a round turns toward is the middle
   of the body's shapes' bounds (Task 3), not `pos + height / 2`.
5. **A body handed by two providers in a chain.** dismember3d's or ragdoll3d's `bodies` hands a body
   whose id the chained mod also hands. The chain's entry with that id is replaced, never doubled
   (Tasks 2 and 9).

---

## Phase A: hitscan3d and volley3d

### Task 1: hitscan3d's bodies, kinds and hurt

**Files:**
- Modify: `plugins/hitscan3d/hitscan3d.sim.ts` (whole file and header)
- Modify: `plugins/hitscan3d/hitscan3d.volley3d.ts`

**Interfaces:**
- Produces, in `hitscan3d.sim.ts`:
  ```ts
  export type Shape = { part: string } & (
    | { cylinder: { pos: number[]; radius: number; height: number } }   // upright, from its foot `pos`
    | { capsule: { a: number[]; b: number[]; radius: number } })        // a sphere when a and b are one point
  export type Body = { id: number; kind: string; pos: number[]; shapes: Shape[] }
  export type Numbers = { kinds: Record<string, { off?: string; tall?: string }>; rewind: number }
  export type Hurt = { damage: number | Record<string, number>; by: number; [more: string]: unknown }
  export type Struck = Hurt & { damage: number; part: string | null; point: number[]; dir: number[]; what: 'body' | 'splash' | 'blast' }
  export type Hit = { t: number; point: number[]; normal: number[]; what: 'ground' | 'solid' | 'body'; id?: number; kind?: string; part?: string }
  export function shoot(w: W, from: number[], dir: number[], far: number,
    opts?: { skip?: number[]; seen?: number; bodies?: boolean; grow?: number; hurt?: Hurt }): Hit | undefined
  export function hittable(w: W): Body[]
  export function capsule(o: number[], d: number[], far: number, a: number[], b: number[], r: number): Surface | undefined
  export function cylinder(...)   // unchanged, still used for solids and cylinder shapes
  ```
- The `bodies` mod's type becomes `(w: W) => Body[]`.
- A row's `hit` act is called `w.call(row, 'hit', -1, struck: Struck)`.

- [ ] **Step 1: Write the header.** It covers:
  - the mods (`bodies` hands `Body[]`, each with its shapes in the world);
  - `world.hitscan3d.kinds` (`off`, `tall`; a kind not listed is never hit);
  - `tall`: the row field that, when it carries a number, sets the `height` of that body's
    `cylinder` shapes (a crouch). Capsule shapes come from the pose and ignore it;
  - `shoot`'s `hurt`. With one given, a body met is hurt: its row's `hit` act is called with
    `{ ...hurt, damage, part, point, dir, what: 'body' }`. `damage` is `hurt.damage` when it is a
    number, else `hurt.damage[part]`, which must exist. `dir` is the unit way the line runs. With
    none, `shoot` only answers, as today;
  - `Struck`, what every `hit` act receives, and its `what`: `body` from a shot, `splash` from
    volley3d, `blast` from a rule's burst;
  - aiming back (`seen`), now keeping each step's bodies' shapes.

  Remove every line about `parts`.
- [ ] **Step 2: Implement `capsule()`.** It is the first `t` in `[0, far]` at which the line from `o`
  along unit `d` comes within `r` of segment `a`–`b` (the swept-sphere test: solve against the
  infinite cylinder of radius `r` about the axis, keep a root whose axis parameter is in `[0, 1]`,
  else test the end spheres at `a` and `b`, nearest root kept). The normal is from the nearest axis
  point to the surface point. From inside, it is where the line leaves. A capsule with `a` = `b` is
  one sphere.
- [ ] **Step 3: Implement `shoot`.**
  - For each body, test every shape grown by `grow`: `cylinder()` for a cylinder (height from
    `tall` when the row carries it, as `upright` does now), `capsule()` for a capsule. The nearest
    shape's `part` is the hit's `part`.
  - After the nearest thing is found: when it is a body and `opts.hurt` is given, resolve `damage`
    (throw as in Review Focus 2) and call `w.call(w.get(id), 'hit', -1, struck)`.
  - Return the `Hit`.
- [ ] **Step 4: Rewind and `hittable`.**
  - `after` keeps `bodiesOf(w)` with each shape's points copied.
  - `bodiesAt` puts back the kept `pos` and shapes of the bodies that are still there.
  - `upright` keeps the `off` rule and applies `tall` to cylinder shapes.
  - `hittable` returns `Body[]` of the new shape.
- [ ] **Step 5:** In `hitscan3d.volley3d.ts`, `shoot(w, from, dir, far, { skip, grow, hurt })` passes
  `hurt` through, and `bodies(w)` returns `hittable(w)`. Rewrite the header to say so.
- [ ] **Step 6:** Run `yarn tsc`. Expected: errors only in test files and in the providers and callers
  Tasks 2-6 change. List them; they are Tasks 2-6's work.
- [ ] **Step 7:** Commit in core: `hitscan3d: a body is its shapes; shoot takes a hurt and calls the struck row's hit`.

### Task 2: the bodies providers

**Files:**
- Modify: `plugins/walker/walker.hitscan3d.ts`
- Create: `plugins/ragdoll3d/ragdoll3d.hitscan3d.ts`
- Modify: `plugins/ragdoll3d/ragdoll3d.sim.ts:26-27,149-187` (`struck` removed; header)
- Modify: `games/mech/plugins/base/base.hitscan3d.ts`, `games/mech/plugins/base/base.sim.ts:80-84` (`coreOf`)

**Interfaces:**
- Consumes: Task 1's `Body`, `Shape`; ragdoll3d's `capsules(w, me)`, which reads ragdoll3d's own `ends`.
- Produces:
  - walker: `bodies(w): Body[]`. Every row of every `world.walker.kinds` kind, `pos` its feet, and one
    shape `{ part: <kind>, cylinder: { pos, radius, height } }` from its kind's numbers.
  - ragdoll3d: `bodies(w): Body[]`. The bodies `mod(w.world, 'ragdoll3d', 'bodies')` hands (none
    when no mod is named), with every body whose row is of an anim kind (`world.anim.kinds`) whose
    rig carries `ends` for its model replaced by `{ id, kind, pos, shapes: capsules(w, row).map(c =>
    ({ part: c.bone, capsule: { a: c.a, b: c.b, radius: c.radius } })) }`. Rows of such kinds the
    chained mod does not hand are added. The one body per id is kept, ragdoll3d's.
  - base: `coreOf` returns `{ id, kind, pos, shapes: [{ part: kind, cylinder: { pos, radius, height } }] }`.

- [ ] **Step 1:** Rewrite `walker.hitscan3d.ts` and its header.
- [ ] **Step 2:** Write `ragdoll3d.hitscan3d.ts` with the header pattern of `walker.hitscan3d.ts`.
  Find the chained provider once per `w.world` (a `WeakMap`), as the using-3d-physics skill's chain
  section says. Add `bodies` to ragdoll3d's header list of the mods it takes.
- [ ] **Step 3:** Delete `struck` from `ragdoll3d.sim.ts`. `capsules` stays, its header line saying
  `ragdoll3d.hitscan3d.ts` hands it to hitscan3d.
- [ ] **Step 4:** Reshape `coreOf` and `base.hitscan3d.ts`'s `bodies`. Rewrite both headers.
  `walker.base.ts` re-exports walker's and needs no change.
- [ ] **Step 5:** Run `yarn tsc`. Expected: errors only in test files and in Tasks 3-6's callers.
- [ ] **Step 6:** Commit in core and in games: `hitscan3d's bodies: walker's cylinders, ragdoll3d's bone capsules, the base's cores`.

### Task 3: volley3d hurts

**Files:**
- Modify: `plugins/volley3d/volley3d.sim.ts` (header 1-86, types 98-108, `far`, `middle`, `fly`, `fire`)

**Interfaces:**
- Consumes: the `shoot` mod now taking `hurt`; `bodies` now `Body[]` with shapes.
- Produces:
  - `fire(w, pattern, at, dir, by: { from; n; skip; target?; ride?; hurt: Hurt })`. `Entry` gains
    `hurt` and keeps `hit` (what it met).
  - volley3d's own types `Shape`, `Body`, `Shoot`, mirroring hitscan3d's. volley3d imports no
    hitscan3d type: a mod's types are the asker's.
  - `far(b: Body, p: number[]): number`: the least metres from `p` to any of the body's shapes,
    0 inside one.
  - `middle(b: Body)`: the middle of the box bounding its shapes.

- [ ] **Step 1: Header.**
  - `landed` goes everywhere.
  - A round's `hurt` is handed to `shoot`, so the body it meets is hurt there.
  - Then every other body nearer than `splash` is called `hit` with
    `{ ...hurt, damage: hurt.damage × (1 − far / splash), part: null, point, dir: the unit way from
    the point to the body's middle, what: 'splash' }`, the shooter's own body among them.
  - `hurt.damage` must be a number in a pattern with `splash`.
- [ ] **Step 2:** Implement `fly`:
  - The `shoot` mod call gets `hurt: e.hurt`.
  - The two `landed` calls go.
  - Splash calls `w.call(w.get(b.id), 'hit', -1, struck)` for each body in reach, and throws
    `volley3d pattern <name> splashes, and its round's hurt gives damage by part` on a table.
- [ ] **Step 3:** Implement `far` and `middle` on shapes. A cylinder's distance is today's `far`
  arithmetic. A capsule's is the distance to its segment less its radius, held at 0.
- [ ] **Step 4:** Run `yarn tsc`. Expected: errors only in test files and in mech's `modules.sim.ts`
  and `mechs.sim.ts` (Task 4).
- [ ] **Step 5:** Commit in core: `volley3d: a round carries its hurt; what it meets and what it splashes are hit`.

### Task 4: mech onto the one hit

**Files:**
- Modify: `games/mech/plugins/modules/modules.sim.ts` (header 72-97; `round` 217-228; `launch`
  263-281; `line` 305-312; beam tick 418-419; delete `landed` 524-534 and its export)
- Modify: `games/mech/plugins/mechs/mechs.sim.ts` (header 86-97; `destroy` 255-265; `hit` 356-368;
  delete the `landed` act 369-371 and its import; new export `spared`)
- Modify: `games/mech/plugins/raiders/raiders.sim.ts` (header 60-70; `round` 154-159; `hit` 238-252)
- Modify: `games/mech/contractor.sim.ts` (header 4-8, 54-58; `hit` 174-187)
- Modify: `games/mech/plugins/base/base.sim.ts` (header 18-19; `hit` 129-138)
- Modify: every mech scene file holding `world.hitscan3d.kinds`. `grep -rln '"parts"' games/mech`
  lists them, `hills.partial_scene.json:343-470` and `gym.scene.json:240` among them. Each kind's
  entry keeps `off` and loses `parts`.

**Interfaces:**
- Consumes: `shoot(..., { hurt })`, `fire(..., { hurt })`, `Struck`.
- Produces:
  - Every mech kind's act is `hit(me, w, seat, h: Struck)`. `h.by` is the row that hurt it and
    `h.damage` the harm.
  - `spared(w: W, me: Row, h: Struck): boolean` in `mechs.sim.ts`: `h.what === 'splash'` and the row
    `h.by` is still there with `team === me.data.team`. This is the rule `landed` kept at
    `modules.sim.ts:531`.

- [ ] **Step 1: modules.**
  - `round` passes `hurt: { damage: k.damage, by: mech.id }` to `shoot` and drops the `w.call`.
  - `line(m, w, k, way?, hurt?)` passes `hurt`. The beam's tick calls it with
    `{ damage: k.dps * dt, by: mech.id }` and drops its `w.call`. The beam's trigger and the
    designator pass none.
  - `launch` passes `hurt: { damage: k.damage, by: mech.id }` to `fire`.
  - Delete `landed`.
  - Header: a body met is hurt through the shot; the behaviour change under "What Bill approves".
- [ ] **Step 2: mechs.**
  - `hit(me, w, seat, h)` returns when `seat !== -1`, on a wreck, or when `spared(w, me, h)`.
    Otherwise as today with `h.damage` and `h.by`.
  - `destroy`'s reactor burst calls `w.call(o, 'hit', -1, { damage: blast.damage * (1 - far /
    blast.radius), by: me.id, part: null, point: d.pos, dir: <unit me→o>, what: 'blast' })`. Its
    distance is from `b.pos`, as today.
  - Delete the `landed` act.
  - Header lines 86-97.
- [ ] **Step 3: raiders, contractor, structure.**
  - Each `hit(me, w, seat, h: Struck)` returns on `spared(w, me, h)` too (they are on teams:
    raiders 'enemy', contractor and structures 'seat').
  - The raider's `round` passes `hurt: { damage: r.damage, by: me.id }` and drops its `w.call`.
  - Rewrite each header's `hit(damage, by)` line to `hit(struck)`.
- [ ] **Step 4:** Remove `parts` from every mech scene's `world.hitscan3d.kinds`.
- [ ] **Step 5:** Fix `games/mech/README.md`'s lines about hits and `landed`.
- [ ] **Step 6:** Run `yarn tsc`. Expected: no errors in `games/mech` outside test files.
- [ ] **Step 7: Play mech in Chrome** (good-webviews skill, `yarn editor mech` or the game's
  `index.html`):
  - highlands: a gun, a beam and a launcher each hurt a raider; a splash spares a structure; a
    reactor mech's burst hurts what is near.
  - Read each from the rows (`hp`, `armour`, `by`) in `dev.html`.
- [ ] **Step 8:** Commit in games: `mech: every round, beam, splash and burst through hitscan3d's and volley3d's one hit`.

### Task 5: shooter onto the one hit, on bone capsules

**Files:**
- Modify: `games/shooter/assets/soldier.rig.json` (rebaked with `ends`)
- Modify: `games/shooter/valley.scene.json:755-800` (hitscan3d mods and kinds; ragdoll3d mods)
- Modify: `games/shooter/assets/shooter.json` (each soldier kind's `rifle.damage`)
- Modify: `games/shooter/plugins/soldier/soldier.sim.ts` (header 76-77, 84-95; `fire` 271-311; `hurt`
  359-372 becomes `hit`)
- Modify: `games/shooter/shooter.balance.ts` (its `parts` tally keyed by the new parts)

**Interfaces:**
- Consumes: Task 2's ragdoll3d `bodies`, Task 1's `shoot(..., { hurt })`.
- Produces: the soldier's act `hit(me, w, seat, h: Struck & { knock: { speed: number; height: number } })`.

- [ ] **Step 1: Bake.**
  - Rebake the soldier rig by the using-mixamo-assets skill's hand bake, with every body its
    `bodies` names:
    `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python plugins/anim/anim.export.py -- games/shooter/assets/soldier.rig.json <scratch>/table.json <body>=<its glb> …`,
    then `node .claude/skills/using-mixamo-assets/scripts/merge-table.mjs games/shooter/assets/soldier.rig.json <scratch>/table.json games/shooter/assets/soldier.rig.json`.
  - Expected: one `ENDS <body> clips=<n>` line per body.
  - The rig's diff holds `ends` and the table's numbers only.
- [ ] **Step 2: valley scene.**
  - `world.hitscan3d.mods.bodies` becomes `ragdoll3d`, and `world.ragdoll3d.mods.bodies`, `walker`.
  - Each kind in `world.hitscan3d.kinds` keeps `off` and loses `parts` and `tall`. The soldier's own
    `tall` field stays, since the knock's height reads it.
- [ ] **Step 3: shooter.json.** Each soldier kind's `rifle.damage` names every bone of ragdoll3d's
  `PHYSICS.bones` (all 14):
  - `head`: today's `head` value;
  - `torso`, `armL`, `forearmL`, `handL`, `armR`, `forearmR`, `handR`: today's `torso` value;
  - `uplegL`, `legL`, `footL`, `uplegR`, `legR`, `footR`: today's `legs` value.

  These are the old height bands carried onto the bones that stood in them.
- [ ] **Step 4: soldier.**
  - `fire`'s second `shoot` passes `hurt: { damage: r.damage, by: me.id, knock: r.knock }` and drops
    the `w.call`.
  - `d.struck += 1` stays on `hit?.id !== undefined`.
  - The kill moves into the victim: `hit` adds 1 to `w.get(h.by).data.kills` when it dies of this
    hit and that row is still there.
  - `hurt` is renamed `hit`. The bearing and the knock come from the row `h.by`'s `pos` and
    `h.knock`.
  - Header lines 76-77 and 84-95.
- [ ] **Step 5:** Fix `shooter.balance.ts`'s part tally, and every line of the shooter's README or
  headers naming legs/torso/head parts.
- [ ] **Step 6:** Run `yarn tsc`. Expected: no errors in `games/shooter` outside test files.
- [ ] **Step 7: Play valley in Chrome.** A head shot takes the head's damage, a hand shot the
  torso's, a crouched soldier is hit on its crouched bones. Read `hp` and `shot.part` off the rows.
- [ ] **Step 8:** Commit in games: `shooter: soldiers hit on their bones, the rifle's hurt through hitscan3d`.

### Task 6: horde's blast onto the one hit

**Files:**
- Modify: `games/horde/blast.scene.json:20` (`hitscan3d.mods.bodies: 'ragdoll3d'`, `kinds.victim: { off: 'limp' }`)
- Modify: `games/horde/player.sim.ts` (header 27-29, 51-55; `blast` 56-89)
- Modify: `games/horde/victim.sim.ts` (header 7-8; act `die(hits)` becomes `hit(struck)`)
- Modify: `games/horde/assets/horde.json` (`player.shotgun` gains `damage`, the hp a pellet takes)

**Interfaces:**
- Consumes: Task 2's ragdoll3d `bodies`; `shoot(..., { hurt })`.
- Produces: victim's `hit(me, w, seat, h: Struck & { impulse: number })`. It dies (ragdoll3d's `die`)
  with `[{ bone: h.part, point: h.point, impulse: h.dir × h.impulse }]`.

- [ ] **Step 1:** Each pellet becomes one `shoot(w, from, p, k.far, { skip: [], hurt: { damage:
  k.damage, by: me.id, impulse: k.impulse } })`. The tracer ends at the hit's point or at `far`. The
  victim loop and the ragdoll3d `struck` import go. The `hits` map goes, or stays as Bill chose
  under "What Bill approves".
- [ ] **Step 2:** victim's `hit` as above. Its `stand` is unchanged.
- [ ] **Step 3:** Run `yarn tsc`. Expected: no errors in `games/horde` outside test files, except
  `player.sim.ts`'s minigun, which Task 11 moves.
- [ ] **Step 4:** Play blast in Chrome: a pull kills the victims it meets and they fall pushed along
  the pellets.
- [ ] **Step 5:** Commit in games: `horde blast: the shotgun's pellets through hitscan3d's hit`.

## Phase B: dismember3d

### Task 7: anim's `ends`

**Files:**
- Modify: `plugins/anim/anim.sim.ts` (header's `ends` line near 64; new export)
- Modify: `plugins/ragdoll3d/ragdoll3d.sim.ts:39-41,106-114` (its `ends` removed, imported from anim)

**Interfaces:**
- Produces: `ends(w: W, me: Row, segment: string, at?: { clip: string; clipT: number }): number[]` in
  `plugins/anim/anim.sim.ts`. It returns `[ax, ay, az, bx, by, bz]` in the body's frame, read from
  `rigOf(w, animKind(me)).ends[<the kind's model>][at.clip][segment]` at frame
  `round(at.clipT * fps)`, held within the rows. The body is the one ragdoll3d's version uses today.
  It throws `anim: <kind>'s rig has no ends for <model>; bake it (anim.export.py)` when the rig has
  none.

- [ ] **Step 1:** Move the function body unchanged from `ragdoll3d.sim.ts:108-114` into
  `anim.sim.ts`, adding the throw above. Rewrite anim's header line for `ends` to say `ends(w, me,
  segment, at?)` reads it.
- [ ] **Step 2:** In `ragdoll3d.sim.ts`, delete its `ends` and import anim's. Its header line 39-41
  says it reads anim's `ends`.
- [ ] **Step 3:** Run `yarn tsc`. Expected: no errors outside test files.
- [ ] **Step 4:** Commit in core: `anim: ends, a segment's two ends off the rig, moved from ragdoll3d`.

### Task 8: dismember3d's server half

**Files:**
- Create: `plugins/dismember3d/dismember3d.sim.ts`

**Interfaces:**
- Consumes:
  - anim's `ends`;
  - `def` is not used: every number is a plugin default or `world.dismember3d`;
  - ragdoll3d's `die`, as the farmer uses it today (`farmer.sim.ts:86`).
- Produces:
  ```ts
  export const LIMBS: Record<string, { piece: string; below: string[]; joint: { radius: number; hp: number; about?: boolean };
    push: number[]; spin: number[]; kills?: boolean; crawls?: boolean; fall?: { dir: number[]; speed: number; height: number } }>
  export const PIECES: string[]                      // the piece kinds LIMBS names, each once
  export type Joint = { segment: string; at: number[]; radius: number }
  export function joints(w: W | Wire, me: Row): Joint[]
  export function hit(w: W, me: Row, h: Struck): void
  export function lose(w: W, me: Row, limb: string): void
  export function pieces(w: W, body: Row): Row[]
  ```
  `world.dismember3d`: `{ kinds: { <kind>: { gore?: { sever?: string; drip?: string } } }, mods?: { bodies?: string; land?: string } }`.

- [ ] **Step 1: Header.** In the voice of the old `limbs.plugin.ts`, `joints.sim.ts` and
  `farmer.sim.ts:17-33` headers, merged. It covers:
  - the limbs and their bones;
  - `LIMBS`, the Mixamo default: the 13 rows of today's `horde.json` `farmer.limbs`, with `kind`
    renamed `piece`;
  - where a joint stands;
  - `hit`, `lose`;
  - the piece row's fields (`of`, `limbs`, `pos`, `rot`, `vel`, `spin`);
  - the body row's fields it writes (`off`, `hp`, `rig` to `crawl`, and ragdoll3d's dying row through
    `die`);
  - `world.dismember3d`;
  - the mods.
- [ ] **Step 2:** `LIMBS` holds today's `assets/horde.json:24-38` values verbatim, `kind` as `piece`.
- [ ] **Step 3:** `joints` is today's `joints.sim.ts:31-45` reading `LIMBS` and anim's `ends`.
  `lose` is today's `farmer.sim.ts:59-87` reading `LIMBS` and anim's `ends`.
- [ ] **Step 4:** `hit` is today's farmer act (`farmer.sim.ts:117-124`) on `h.part` and `h.damage`.
  It does nothing for a part `LIMBS` does not name.
- [ ] **Step 5:** `pieces(w, body)` is every row of `PIECES` whose `of` is `body.id`.
- [ ] **Step 6:** Run `yarn tsc`. Expected: no new errors.
- [ ] **Step 7:** Commit in core: `dismember3d: limbs that come off a Mixamo body, its server half`.

### Task 9: dismember3d's mod for hitscan3d

**Files:**
- Create: `plugins/dismember3d/dismember3d.hitscan3d.ts`

**Interfaces:**
- Consumes: Task 8's `joints`; Task 1's `Body`.
- Produces: `bodies(w): Body[]`.
  - It takes the bodies `mod(w.world, 'dismember3d', 'bodies')` hands, or none.
  - Every row of a kind in `world.dismember3d.kinds` that is not limp replaces its entry, or is
    added, as `{ id, kind, pos, shapes: joints(w, row).map(j => ({ part: j.segment, capsule: { a:
    j.at, b: j.at, radius: j.radius } })) }`.
  - A row with no `clip` yet has no joints and no shapes, as `joints` says.

- [ ] **Step 1:** Write it with its header, the chained provider found once per `w.world`.
- [ ] **Step 2:** Run `yarn tsc`.
- [ ] **Step 3:** Commit in core: `dismember3d: its joints are the bodies hitscan3d hits`.

### Task 10: dismember3d's page half

**Files:**
- Create: `plugins/dismember3d/dismember3d.plugin.ts`
- Create: `plugins/terrain3d/terrain3d.dismember3d.ts`

**Interfaces:**
- Consumes: `plugins.anim.model(id)`, `plugins.render3d`, `plugins.box3d.follow/drop`,
  `plugins.particle3d.emit`, `plugins.wire.rows`, `plugins.wire.scene.world.dismember3d`, and
  `PIECES` from `./dismember3d.sim.ts`.
- Produces:
  - `export function dismember3d()` returning `{ afterTick(plugins), close(plugins) }`. Each frame:
    - every row of a kind in `world.dismember3d.kinds` draws its model without the triangles of its
      `off` limbs (today's `label`/`labelled`/`show`, the cache per model held inside the function);
    - every row of `PIECES` is drawn once its body's model is there, and dropped when its row ends
      (today's `draw`/`drop`/`bake`);
    - every new piece bursts `gore.sever` and carries `gore.drip` from its body kind's `gore`;
    - the floor comes from the `land` mod (`mod(scene.world, 'dismember3d', 'land')`), or y 0
      with none.
  - `terrain3d.dismember3d.ts`: `land(plugins)`, the same as `terrain3d.ragdoll3d.ts`'s.

- [ ] **Step 1:** Write the header from `limbs.plugin.ts:1-11` and 88-123: what it draws, the gore,
  the `land` mod with none named, and the order it is listed in (after anim, box3d and particle3d,
  before render3d). It checks with `ahead` for what it reads made the same frame.
- [ ] **Step 2:**
  - Port `label`, `show`, `bake`, `draw`, `drop` and `gore` from `limbs.plugin.ts` into the
    function, its state inside it.
  - Every piece row is drawn by the plugin, so no piece kind has a `client.ts`.
  - Rebuild a body's triangle list only when its model or its `off` changes, as `farmer.client.ts`
    does now.
- [ ] **Step 3:** Write `terrain3d.dismember3d.ts`.
- [ ] **Step 4:** Run `yarn tsc`.
- [ ] **Step 5:** Commit in core: `dismember3d: its page half, lost limbs hidden, pieces drawn and gored`.

### Task 11: horde onto dismember3d

**Files:**
- Modify: `games/horde/farmer.sim.ts` (header; `lose` and both acts become one `hit` line; `clear`
  uses `pieces`)
- Modify: `games/horde/player.sim.ts` (header 18-25, 34-35; minigun 139-155; `cut` 179)
- Modify: `games/horde/farmer.client.ts` (only the debug spheres, from dismember3d's `joints`)
- Modify: `games/horde/player.client.ts:25` (`floorAt` held in it, reading terrain3d's ground as it
  does now)
- Modify: `games/horde/plugins/ground/ground.sim.ts:16` (`PIECES` from dismember3d)
- Delete:
  - `games/horde/skull.client.ts`, `arm.client.ts`, `forearm.client.ts`, `hand.client.ts`,
    `thigh.client.ts`, `shin.client.ts`, `foot.client.ts`;
  - `games/horde/plugins/limbs/`, `games/horde/plugins/joints/`;
  - `games/horde/assets/limbs.json`, `games/horde/assets/limbs.py`.
- Modify: `games/horde/assets/horde.json` (the `farmer.limbs` table goes)
- Modify: `games/horde/main.scene.json`:
  - `plugins` gains `dismember3d` after `particle3d`, before `render3d`;
  - `world.limbs` goes;
  - `world.dismember3d: { kinds: { farmer: { gore: { sever: 'sever', drip: 'drip' } } }, mods: { land: 'terrain3d' } }`;
  - `world.hitscan3d.mods.bodies: 'dismember3d'`, `world.hitscan3d.kinds.farmer: { off: 'limp' }`;
  - the `limbs` catalogue entry goes.
- Modify: `games/horde/README.md`

**Interfaces:**
- Consumes: Tasks 8-10.
- Produces: the farmer's acts are `hit(me, w, seat, h) { if (seat === -1) hit(w, me, h) }`, one line.

- [ ] **Step 1: farmer.** Delete `lose`, `times`, `fromUp` and the `joints`/`PIECES` imports.
  - The act is the line above.
  - The limp branch ends `pieces(w, me)` and then rises and ends the body.
  - The header says dismember3d cuts it.
- [ ] **Step 2: player.**
  - The minigun is one `shoot(w, from, dir, k.far, { hurt: { damage: k.damage, by: me.id } })` per
    round. The tracer ends at its point. `hit` is `'body'`, `'ground'` or `'none'` from its `what`.
  - `cut(segment)` calls dismember3d's `lose(w, f, segment)` on every farmer not limp.
  - The joints import goes.
- [ ] **Step 3:** `farmer.client.ts` keeps its debug spheres, reading dismember3d's `joints` and
  `LIMBS[segment].joint.hp`. Its `show` and `labelled` go.
- [ ] **Step 4:** `player.client.ts` and `ground.sim.ts`, as listed.
- [ ] **Step 5:** The scene, `horde.json` and the deletions, as listed. The seven piece kinds' rules,
  box3d kinds and prefabs stay.
- [ ] **Step 6:** Run `yarn tsc` and `yarn lint`. Expected: no errors outside test files.
- [ ] **Step 7:** Commit in games: `horde: farmers hit, cut and gored by dismember3d; limbs, joints and limbs.json gone`.

### Task 12: horde's main scene shown working

- [ ] **Step 1:** `yarn editor horde`, and open the main scene's `index.html` in Chrome (good-webviews
  skill).
- [ ] **Step 2:** Fire at farmers.
  - **Rows** (the scene's rows in `dev.html`, `world.debug.spheres` on): a forearm's joint hp falls
    to 0; the farmer's `off` gains `forearmL` and `handL`; a `forearm` row spawns with
    `of` = that farmer and `limbs` = `["forearmL", "handL"]`. A thigh lost puts `rig` at `crawl`.
    A head lost sets `limp`.
  - **Screen:** the forearm leaves the body and tumbles; the sever burst and the drip show; the
    crawl plays; the head kill drops the body; after `clear` seconds the body and its pieces are
    gone.
- [ ] **Step 3:** Publish one evidence page (provide-evidence skill) with each claim above, the rows
  read, the screenshots and the `yarn tsc` output, Tasks 4-6's checks included.
